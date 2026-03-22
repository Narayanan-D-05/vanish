"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { DAppConnector } from "@hashgraph/hedera-wallet-connect";
import { getBalance } from "@/lib/api";

interface WalletState {
  accountId: string | null;
  evmAddress: string | null;
  isConnected: boolean;
  balance: number;
  provider: unknown;
  accountMismatch?: boolean;
  metaMaskAddress?: string | null;
  pendingAction: {
    id: string;
    type: string;
    recipient: string;
    amount: number;
    message?: string;
  } | null;
  isProvisioning: boolean;
}

interface WalletContextType extends WalletState {
  connectHashPack: () => Promise<void>;
  connectMetaMask: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  executeTransaction: (transaction: unknown) => Promise<unknown>;
  confirmAction: (id: string) => Promise<void>;
  cancelAction: (id: string) => Promise<void>;
  isProvisioning: boolean;
}

const WalletContext = createContext<WalletContextType | null>(null);

const WC_PROJECT_ID = "66f7f0c1e05d9e50e93297a7e8b6b231";
const HASHPACK_EXTENSION_ID = "gjagmgiddbbciopjhllkdceadplhpgmh";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [dappConnector, setDappConnector] = useState<DAppConnector | null>(null);
  const [state, setState] = useState<WalletState>({
    accountId: null,
    evmAddress: null,
    isConnected: false,
    balance: 0,
    provider: null,
    accountMismatch: false,
    metaMaskAddress: null,
    pendingAction: null,
    isProvisioning: false,
  });

  // -------------------------------------------------------------------
  // SIGNATURE-TO-SEED (Production Pattern)
  // Build a domain-bound sign message, sign it with MetaMask, and hash
  // the result into a deterministic agentSeed.  Never stored to disk.
  // -------------------------------------------------------------------

  /**
   * Derives a deterministic 32-byte agent seed from a MetaMask signature.
   * The message is bound to the domain, account, and chain so the signature
   * is useless to any attacker that intercepts it outside this context.
   */
  const deriveAgentSeed = async (
    eth: { request: (p: unknown) => Promise<unknown> },
    address: string
  ): Promise<string | null> => {
    try {
      // EIP-4361 style domain-bound message — replay protection
      const message = [
        "Welcome to Vanish Protocol.",
        "",
        "Sign this message to securely derive your local AI Agent's privacy keys.",
        "This does NOT expose your main wallet's private key.",
        "",
        `URI: ${window.location.host}`,
        `Address: ${address}`,
        `Chain ID: 296`,
        `Security Version: v1`,
      ].join("\n");

      // User signs — MetaMask shows the full text
      const signature = await eth.request({
        method: "personal_sign",
        params: [message, address],
      }) as string;

      // Hash the signature to get 32 bytes of pure entropy
      // Use SubtleCrypto (no external lib needed on frontend)
      const msgBuf = new TextEncoder().encode(signature);
      const hashBuf = await crypto.subtle.digest("SHA-256", msgBuf);
      const agentSeed =
        "0x" +
        Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      return agentSeed;
    } catch (err) {
      console.error("[Vanish] Signature request cancelled or failed:", err);
      return null;
    }
  };

  /**
   * Registers the connected session with the User Agent backend.
   * Sends evmAddress + agentSeed (never stored in localStorage).
   */
  const registerSessionWithSeed = async (
    evmAddress: string,
    agentSeed: string,
    walletType: string
  ) => {
    try {
      const res = await fetch("http://localhost:3001/api/session/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evmAddress, agentSeed, walletType }),
      });
      const data = await res.json();
      if (data.success) {
        console.log(`[Vanish] Agent cryptography provisioned for ${evmAddress}`);
        return true;
      } else {
        console.warn("[Vanish] Session registration failed:", data.error);
        return false;
      }
    } catch (err) {
      console.warn("[Vanish] Could not reach User Agent:", err);
      return false;
    }
  };

  // Deregister session on disconnect
  const deregisterSession = useCallback(async (evmAddress: string | null) => {
    try {
      await fetch("http://localhost:3001/api/session/disconnect", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evmAddress })
      });
    } catch {
      // ignore — backend might be down
    }
  }, []);

  const confirmAction = useCallback(async (id: string) => {
    const USER_AGENT_URL = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
    try {
      const response = await fetch(`${USER_AGENT_URL}/api/action/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationId: id })
      });
      if (response.ok) {
        setState(prev => ({ ...prev, pendingAction: null }));
      }
    } catch (err) {
      console.error('Failed to confirm action:', err);
    }
  }, []);

  const cancelAction = useCallback(async (id: string) => {
    const USER_AGENT_URL = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
    try {
      const response = await fetch(`${USER_AGENT_URL}/api/action/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationId: id })
      });
      if (response.ok) {
        setState(prev => ({ ...prev, pendingAction: null }));
      }
    } catch (err) {
      console.error('Failed to cancel action:', err);
    }
  }, []);


  // SSE Listener for real-time confirmations
  useEffect(() => {
    if (!state.isConnected) return;
    
    const USER_AGENT_URL = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
    const userAgentSource = new EventSource(`${USER_AGENT_URL}/api/stream/thoughts`);
    const currentAddress = state.evmAddress;

    // Named SSE event — this is what the backend sends for confirmation-required
    const handleConf = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // --- MULTI-TENANT ISOLATION ---
        if (data.initiatorAddress && currentAddress &&
            data.initiatorAddress.toLowerCase() !== currentAddress.toLowerCase()) {
          return;
        }

        console.log('🛡️ UI Confirmation Required:', data.id);
        setState(prev => ({
          ...prev,
          pendingAction: {
            id: data.id,
            type: data.type,
            recipient: data.recipient || '',
            amount: data.amount || 0,
            message: data.message
          }
        }));
      } catch (err) {
        console.warn('[WalletProvider] Failed to parse confirmation-required event:', err);
      }
    };

    userAgentSource.addEventListener('confirmation-required', handleConf);

    return () => {
      userAgentSource.removeEventListener('confirmation-required', handleConf);
      userAgentSource.close();
    };
  }, [state.isConnected, state.evmAddress]);

  useEffect(() => {
    const initWC = async () => {
      try {
        // @ts-expect-error - DAppConnector constructor types in some hashgraph packages require generic trailing params
        const connector = new DAppConnector({
          metadata: {
            name: "Vanish Protocol",
            description: "AI-Powered Privacy Layer on Hedera",
            url: window.location.origin,
            icons: [window.location.origin + "/logo.png"],
          },
          projectId: WC_PROJECT_ID,
          methods: ["hedera_signAndExecuteTransaction", "hedera_signMessage"],
          events: ["accountsChanged", "chainChanged"],
          chains: ["hedera:296"],
        });

        await connector.init();
        setDappConnector(connector as unknown as DAppConnector);

        const connectorUnknown = connector as unknown as Record<string, unknown>;
        if (typeof connectorUnknown.onSessionUpdate === 'function') {
          (connectorUnknown.onSessionUpdate as (cb: (session: unknown) => void) => void)((session: unknown) => {
            console.log("Session updated:", session);
          });
        }
      } catch (err) {
        console.error("WalletConnect init failed:", err);
      }
    };

    if (typeof window !== "undefined") {
      initWC();
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!state.accountId) return;
    try {
      // Use backend API to fetch real balance from Hedera
      const response = await getBalance(state.accountId);
      if (response.success) {
        setState((prev) => ({
          ...prev,
          balance: response.balance,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }, [state.accountId]);

  const connectHashPack = useCallback(async () => {
    try {
      if (typeof window === "undefined") return;
      const win = window as unknown as { hashpack: { connect: () => Promise<{ success: boolean; accountId: string; evmAddress: string }> } };
      let attempts = 0;
      while (!win.hashpack && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      if (!win.hashpack) {
        window.open(`https://chrome.google.com/webstore/detail/${HASHPACK_EXTENSION_ID}`, "_blank");
        throw new Error("HashPack extension not found. Please install it.");
      }
      const hashpack = win.hashpack;
      const response = await hashpack.connect();
      if (response.success && response.accountId) {
        setState(prev => ({
          ...prev,
          accountId: response.accountId,
          evmAddress: response.evmAddress || null,
          isConnected: true,
          balance: 0,
          provider: hashpack,
        }));
        // Fetch balance from backend API
        try {
          const balanceResponse = await getBalance(response.accountId);
          if (balanceResponse.success) {
            setState((prev) => ({
              ...prev,
              balance: balanceResponse.balance,
            }));
          }
        } catch (err) {
          console.error("Failed to fetch initial balance:", err);
        }
      }
    } catch (error) {
      console.error("HashPack connection failed:", error);
      throw error;
    }
  }, []);

  const connectMetaMask = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && (window as unknown as { ethereum?: { request: (params: unknown) => Promise<unknown> } }).ethereum) {
        const eth = (window as unknown as { ethereum: { request: (params: unknown) => Promise<unknown> } }).ethereum;
        
        await eth.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
        
        const accounts = await eth.request({ method: "eth_accounts" }) as string[];
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          
          // Set identity immediately to trigger UI wipe and correctly filter incoming logs
          setState(prev => ({ 
            ...prev, 
            isProvisioning: true, 
            metaMaskAddress: address,
            evmAddress: address,
            accountId: address
          }));

          // Step 2: Derive a deterministic agentSeed from a MetaMask signature
          // User will see a "Sign Message" popup with a domain-bound message
          const agentSeed = await deriveAgentSeed(eth, address);
          if (agentSeed) {
            // Step 3: Register the provisioned cryptographic identity with the User Agent
            const success = await registerSessionWithSeed(address, agentSeed, "metamask");
            
            if (success) {
              // ONLY NOW update the main connection state
              setState(prev => ({
                ...prev,
                accountId: address,
                evmAddress: address,
                isConnected: true,
                balance: 0,
                provider: eth,
                isProvisioning: false,
                accountMismatch: false,
              }));
            } else {
              setState(prev => ({ ...prev, isProvisioning: false }));
              console.error("[Vanish] Registry failed.");
            }
          } else {
            setState(prev => ({ ...prev, isProvisioning: false }));
            console.warn("[Vanish] User declined to sign. Agent features will be limited.");
          }
          return;
        }
      }

      if (!dappConnector) throw new Error("WalletConnect not initialized and no MetaMask found");
      await (dappConnector as unknown as { openModal: () => Promise<void> }).openModal();
      const session = (dappConnector as unknown as { getSession: () => { namespaces: { hedera: { accounts: string[] } } } }).getSession();
      if (session) {
        const accountId = session.namespaces.hedera.accounts[0].split(":")[2];
        setState(prev => ({
          ...prev,
          accountId,
          evmAddress: null,
          isConnected: true,
          balance: 0,
          provider: dappConnector,
        }));
        setTimeout(() => refreshBalance(), 1000);
      }
    } catch (error) {
      console.error("MetaMask connection failed:", error);
      throw error;
    }
  }, [dappConnector, refreshBalance]);

  const disconnect = useCallback(() => {
    const provider = state.provider as { disconnect?: () => void };
    if (provider?.disconnect) provider.disconnect();
    deregisterSession(state.evmAddress); // Notify User Agent the wallet disconnected
    setState(prev => ({
      ...prev,
      accountId: null,
      evmAddress: null,
      isConnected: false,
      balance: 0,
      provider: null,
    }));
  }, [state.provider, state.evmAddress, deregisterSession]);

  // MetaMask Account Watcher
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const eth = window.ethereum as { 
        on: (event: string, handler: (accounts: string[]) => void) => void; 
        removeListener?: (event: string, handler: (accounts: string[]) => void) => void;
      };
      
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else if (state.isConnected && state.evmAddress && accounts[0].toLowerCase() !== state.evmAddress.toLowerCase()) {
          console.log("[Vanish] MetaMask account mismatch detected.");
          setState(prev => ({ ...prev, accountMismatch: true, metaMaskAddress: accounts[0] }));
        } else {
          setState(prev => ({ ...prev, accountMismatch: false, metaMaskAddress: accounts[0] }));
        }
      };

      eth.on("accountsChanged", handleAccountsChanged);
      return () => {
        if (eth.removeListener) eth.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, [state.isConnected, state.evmAddress, disconnect]);

  // Session Watchdog: Detect and recover from backend session loss (e.g. server restart)
  useEffect(() => {
    if (!state.isConnected || !state.evmAddress || state.isProvisioning) return;

    let isChecking = false;
    const checkSession = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const agentUrl = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
        const res = await fetch(`${agentUrl}/api/session/check/${state.evmAddress}`);
        const data = await res.json();
        
        if (data.success && !data.exists) {
          console.warn("[Vanish] Backend session lost. Triggering auto-recovery...");
          connectMetaMask();
        }
      } catch (err) {
        console.error("[Vanish] Session check failed:", err);
      } finally {
        isChecking = false;
      }
    };

    const interval = setInterval(checkSession, 30000); // Check every 30s
    
    // Also check on window focus
    window.addEventListener('focus', checkSession);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkSession);
    };
  }, [state.isConnected, state.evmAddress, state.isProvisioning, connectMetaMask]);

  const executeTransaction = useCallback(
    async (transaction: unknown) => {
      if (!state.provider || !state.accountId) throw new Error("Wallet not connected");
      const provider = state.provider as { request: (params: unknown) => Promise<unknown>, signAndExecuteTransaction: (tx: unknown) => Promise<unknown> };
      if (provider === (window as unknown as { ethereum: unknown }).ethereum) {
        return await provider.request({
          method: "eth_sendTransaction",
          params: [transaction],
        });
      } else {
        return await provider.signAndExecuteTransaction(transaction);
      }
    },
    [state.provider, state.accountId]
  );

  return (
    <WalletContext.Provider value={{ ...state, connectHashPack, connectMetaMask, disconnect, refreshBalance, executeTransaction, confirmAction, cancelAction, isProvisioning: state.isProvisioning }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}
