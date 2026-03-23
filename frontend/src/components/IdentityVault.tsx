/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Eye, EyeOff, AlertTriangle, Shield } from "lucide-react";
import { useWallet } from "@/contexts/WalletProvider";
import { getFragments, getStealthTransfers, getBalance } from "@/lib/api";

interface Transfer {
  id: string;
  amount: number;
  from: string;
  stealthAddress?: string;
}

interface IdentityVaultProps {
  onClaimStealth: (transfer: Transfer) => void;
}

interface Fragment {
  id: string;
  amount: number;
  status: "pending" | "shielded" | "spent";
  sender?: string | null;
  receivedAt?: number | null;
}

interface StealthTransfer {
  id: string;
  amount: number;
  from: string;
  stealthAddress: string;
  status: "unclaimed" | "claimed";
}

const AGENT_ACCOUNT_ID = process.env.NEXT_PUBLIC_AGENT_ACCOUNT_ID || "0.0.8119040";

export function IdentityVault({ onClaimStealth }: IdentityVaultProps) {
  const { accountId: walletAccountId, accountMismatch, metaMaskAddress, connectMetaMask } = useWallet();
  const [showBalance, setShowBalance] = useState(true);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [stealthTransfers, setStealthTransfers] = useState<StealthTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hbarBalance, setHbarBalance] = useState(0);
  const [shieldedBalance, setShieldedBalance] = useState(0);
  const [activeAccount, setActiveAccount] = useState<string>(AGENT_ACCOUNT_ID);
  const [hederaAccountId, setHederaAccountId] = useState<string>("");
  const [agentAccountId, setAgentAccountId] = useState<string>("");
  const [agentBalance, setAgentBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const copyAgentId = () => {
    if (!agentAccountId) return;
    navigator.clipboard.writeText(agentAccountId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionUrl = walletAccountId
          ? `http://localhost:3001/api/session?evmAddress=${walletAccountId}`
          : "http://localhost:3001/api/session";

        let sessionAccountId = AGENT_ACCOUNT_ID;
        let resolvedHederaId = "";
        try {
          const sessionRes = await fetch(sessionUrl);
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            if (sessionData.session?.accountId) {
              sessionAccountId = sessionData.session.accountId;
              // hederaAccountId is available if backend added it to the session response
              resolvedHederaId = sessionData.session.hederaAccountId || "";
            } else if (!walletAccountId) {
              sessionAccountId = sessionData.agentAccountId || AGENT_ACCOUNT_ID;
            } else {
              sessionAccountId = walletAccountId;
            }
          }
        } catch {
          sessionAccountId = walletAccountId || AGENT_ACCOUNT_ID;
        }
        setActiveAccount(sessionAccountId);
        setHederaAccountId(resolvedHederaId);

        // If we don't have the hedera ID yet, try fetching it from mirror node
        if (!resolvedHederaId && sessionAccountId && sessionAccountId.startsWith("0x")) {
          try {
            const mirrorRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${sessionAccountId}`);
            if (mirrorRes.ok) {
              const mirrorData = await mirrorRes.json();
              if (mirrorData.account) setHederaAccountId(mirrorData.account);
            }
          } catch { /* non-critical */ }
        }

        const [fragmentsData, stealthData, balanceData] = await Promise.all([
          getFragments(sessionAccountId).catch(() => ({ success: false, fragments: [] })),
          getStealthTransfers(sessionAccountId).catch(() => ({ success: false, transfers: [] })),
          getBalance(sessionAccountId).catch(() => ({ success: false, balance: 0 })),
        ]);

        if (fragmentsData.success && fragmentsData.fragments) {
          const frags = fragmentsData.fragments.map((f: any) => ({
            id: f.id,
            amount: f.amount,
            status: f.status,
            sender: f.sender || null,
            receivedAt: f.receivedAt || null,
          }));
          setFragments(frags);
          setShieldedBalance(frags.filter((f: Fragment) => f.status !== "spent").reduce((s: number, f: Fragment) => s + f.amount, 0));
        }

        if (stealthData.success && stealthData.transfers) {
          setStealthTransfers(stealthData.transfers.map((t: any) => ({
            id: t.id, amount: t.amount, from: t.from, stealthAddress: t.stealthAddress, status: t.status,
          })));
        }

        if ((balanceData as any).success !== false) setHbarBalance((balanceData as any).balance || 0);

        // Fetch agent account ID from session and its balance
        try {
          const sessionRes2 = await fetch("http://localhost:3001/api/session");
          if (sessionRes2.ok) {
            const sd = await sessionRes2.json();
            const agentId = sd.agentAccountId || AGENT_ACCOUNT_ID;
            setAgentAccountId(agentId);
            // Fetch agent's HBAR balance
            const agentBalRes = await fetch(`http://localhost:3001/api/balance/${agentId}`);
            if (agentBalRes.ok) {
              const agentBal = await agentBalRes.json();
              if (agentBal.success) setAgentBalance(agentBal.balance);
            }
          }
        } catch { /* non-critical */ }
      } catch (err) {
        console.error("Failed to fetch vault data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [walletAccountId]);

  const liquidFrag = fragments.filter(f => f.status === "shielded").reduce((s, f) => s + f.amount, 0);
  const pendingFrag = fragments.filter(f => f.status === "pending").reduce((s, f) => s + f.amount, 0);

  const actionLogs = [
    ...fragments.slice(0, 5).map(f => {
      const isReceived = (f.id || "").startsWith("recv_");
      const ts = (f as any).receivedAt
        ? new Date((f as any).receivedAt).toISOString().replace("T", "_").slice(0, 19)
        : new Date().toISOString().replace("T", "_").slice(0, 19);
      return {
        id: f.id || Math.random().toString(36),
        ts,
        op: isReceived
          ? "INTERNAL_RECEIVED"
          : f.status === "pending" ? "SHIELD_PENDING" : "SHIELD_DEPOSIT",
        hash: f.id ? f.id.slice(0, 6) + "..." + f.id.slice(-4) : "unknown",
        from: isReceived ? ((f as any).sender || "anonymous") : null,
        fee: "0.0012 HBAR",
        status: f.status === "pending" ? "pending" : "verified",
      };
    }),
    ...stealthTransfers.slice(0, 5).map(t => ({
      id: t.id,
      ts: new Date().toISOString().replace("T", "_").slice(0, 19),
      op: t.status === "claimed" ? "STEALTH_CLAIMED" : "STEALTH_RECEIVED",
      hash: (() => { const s = t.stealthAddress || t.id || ""; return s ? s.slice(0, 8) + "..." + s.slice(-4) : "unknown"; })(),
      from: t.from || null,
      fee: "0.0008 HBAR",
      status: t.status === "claimed" ? "verified" : "in-transit",
    })),
  ].slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Account Mismatch Warning */}
      <AnimatePresence>
        {accountMismatch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", padding: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <AlertTriangle style={{ color: "#f59e0b", width: 20, height: 20, flexShrink: 0 }} />
                <div>
                  <p style={{ color: "#f59e0b", fontSize: "0.7rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em" }}>Account Mismatch</p>
                  <p style={{ color: "#bbc9cd", fontSize: "0.65rem", marginTop: 2 }}>
                    MetaMask: <span style={{ color: "#e5e1e4" }}>{metaMaskAddress?.slice(0, 10)}...</span>
                  </p>
                </div>
              </div>
              <button onClick={() => connectMetaMask()} style={{ padding: "0.25rem 0.75rem", border: "1px solid rgba(245,158,11,0.5)", color: "#f59e0b", background: "transparent", fontSize: "0.65rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer" }}>
                Sync Tab
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Fragmented Balance Card ── */}
      <div style={{ position: "relative", overflow: "hidden", backgroundColor: "#1c1b1d", padding: "2rem" }} className="shadow-2xl">
        <div className="noise-overlay absolute inset-0" />
        <div style={{ position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "3rem" }}>
            <span style={{ color: "#bbc9cd", fontSize: "0.65rem", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.2em" }}>Total_Balance</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button onClick={() => setShowBalance(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5a5a5a" }}>
                {showBalance ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
              </button>
              {loading && <RefreshCw style={{ width: 16, height: 16, color: "#8aebff", animation: "spin 1s linear infinite" }} />}
              <Shield style={{ width: 20, height: 20, color: "#8aebff" }} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "4.5rem", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, color: "#8aebff", letterSpacing: "-0.05em", lineHeight: 1 }}>
              {showBalance ? hbarBalance.toFixed(1) : "•••"}
            </span>
            <span style={{ fontSize: "1.5rem", fontFamily: "'Space Grotesk', sans-serif", color: "#bbc9cd", fontWeight: 300 }}>HBAR</span>
          </div>

          {/* Hedera account ID — shown prominently, not the EVM address */}
          {(hederaAccountId || activeAccount) && (
            <p style={{ fontSize: "0.65rem", color: "#3a3a3c", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {hederaAccountId
                ? <><span style={{ color: "#5a5a5a" }}>HBAR·ID: </span>{hederaAccountId}</>
                : activeAccount
              }
            </p>
          )}

          {/* 3-column fragment breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2rem", marginTop: "3rem", borderTop: "1px solid rgba(60,73,76,0.15)", paddingTop: "2rem" }}>
            {[
              { label: "Liquid_Frag", value: showBalance ? liquidFrag.toFixed(2) : "•••" },
              { label: "Shielded_Pool", value: showBalance ? shieldedBalance.toFixed(2) : "•••" },
              { label: pendingFrag > 0 ? "Pending..." : "Unmasking...", value: pendingFrag > 0 ? (showBalance ? pendingFrag.toFixed(2) : "•••") : null },
            ].map(({ label, value }, i) => (
              <div key={i} style={{ opacity: i === 2 && pendingFrag === 0 ? 0.3 : 1 }}>
                <div style={{ fontSize: "0.6rem", color: "#5a5a5a", textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "'Space Grotesk', sans-serif", marginBottom: "0.25rem" }}>{label}</div>
                {value !== null
                  ? <div style={{ fontSize: "1.25rem", color: "#e5e1e4", fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
                  : <div style={{ height: "1.5rem", width: "4rem", background: "rgba(53,52,55,0.5)", animation: "pulse 2s infinite" }} />}
              </div>
            ))}
          </div>
          {/* Agent funding panel */}
          <div style={{
            marginTop: "1.5rem",
            padding: "1rem 1.25rem",
            background: "rgba(138,235,255,0.03)",
            border: "1px solid rgba(138,235,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: "0.55rem", color: "#5a5a5a", textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "'Space Grotesk', sans-serif", marginBottom: "0.35rem" }}>
                Agent_Node · Gas Wallet
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.7rem", fontFamily: "'JetBrains Mono', monospace", color: "#8aebff" }}>
                  {agentAccountId || AGENT_ACCOUNT_ID}
                </span>
                <button
                  onClick={copyAgentId}
                  title="Copy agent account ID"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: copied ? "#32d7c2" : "#5a5a5a", fontSize: "0.6rem", transition: "color 0.2s" }}
                >
                  {copied ? "✓ Copied" : "⎘ Copy"}
                </button>
              </div>
              <div style={{ fontSize: "0.6rem", color: "#3a3a3c", marginTop: "0.2rem", fontFamily: "'JetBrains Mono', monospace" }}>
                Send HBAR here to fund agent gas fees
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.55rem", color: "#5a5a5a", textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "'Space Grotesk', sans-serif", marginBottom: "0.25rem" }}>Agent_Balance</div>
              {agentBalance !== null
                ? <div style={{
                    fontSize: "1.1rem",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    color: agentBalance < 5 ? "#f59e0b" : "#e5e1e4",
                  }}>
                    {agentBalance.toFixed(2)} <span style={{ fontSize: "0.65rem", fontWeight: 300, color: "#7a7a7a" }}>HBAR</span>
                    {agentBalance < 5 && (
                      <div style={{ fontSize: "0.55rem", color: "#f59e0b", marginTop: 2, fontFamily: "'Space Grotesk', sans-serif" }}>⚠ Low — top up to keep agent active</div>
                    )}
                  </div>
                : <div style={{ height: "1.2rem", width: "4rem", background: "rgba(53,52,55,0.5)", animation: "pulse 2s infinite" }} />
              }
            </div>
          </div>

        </div>{/* end relative inner */}
        <div style={{ position: "absolute", bottom: -96, right: -96, width: 256, height: 256, background: "rgba(138,235,255,0.04)", borderRadius: "50%", filter: "blur(100px)", pointerEvents: "none" }} />
      </div>{/* end balance card */}

      {/* ── Private Action Log Table ── */}
      <div style={{ backgroundColor: "#1c1b1d" }}>
        <div style={{ padding: "1.5rem 1.5rem", borderBottom: "1px solid rgba(60,73,76,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#201f22" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Shield style={{ width: 16, height: 16, color: "#8aebff" }} />
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.15em", margin: 0, color: "#e5e1e4" }}>Private_Action_Log</h2>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(60,73,76,0.1)" }}>
                {["Timestamp", "Operation", "From", "Target_Hash", "Network_Fee", "Status"].map(h => (
                  <th key={h} style={{ padding: "1rem 1.5rem", fontSize: "0.6rem", color: "#5a5a5a", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actionLogs.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#3c3c3c", fontFamily: "'Inter', sans-serif", fontSize: "0.8rem" }}>
                  {walletAccountId ? "No actions recorded yet" : "Connect wallet to view your private action log"}
                </td></tr>
              ) : actionLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: "1px solid rgba(60,73,76,0.06)" }}>
                  <td style={{ padding: "1.25rem 1.5rem", color: "#5a5a5a", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>{log.ts}</td>
                  <td style={{ padding: "1.25rem 1.5rem", color: "#e5e1e4", fontSize: "0.75rem", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {log.op}
                  </td>
                  <td style={{ padding: "1.25rem 1.5rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem" }}>
                    {log.from
                      ? <span style={{ color: "#8aebff" }}>{log.from}</span>
                      : <span style={{ color: "#3c3c3c" }}>—</span>
                    }
                  </td>
                  <td style={{ padding: "1.25rem 1.5rem", color: "#5a5a5a", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem" }}>{log.hash}</td>
                  <td style={{ padding: "1.25rem 1.5rem", color: "#7a7a7a", fontSize: "0.75rem" }}>{log.fee}</td>
                  <td style={{ padding: "1.25rem 1.5rem" }}>
                    <span style={{
                      padding: "0.2rem 0.5rem", fontSize: "0.6rem", fontWeight: "bold", textTransform: "uppercase",
                      backgroundColor: log.status === "verified" ? "rgba(50,215,194,0.15)" : log.status === "in-transit" ? "rgba(138,235,255,0.1)" : "rgba(53,52,55,0.5)",
                      color: log.status === "verified" ? "#5bf4de" : log.status === "in-transit" ? "#8aebff" : "#bbc9cd",
                    }}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
