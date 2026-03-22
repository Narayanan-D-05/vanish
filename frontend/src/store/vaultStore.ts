import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface Fragment {
  id: string;
  amount: number;
  commitment: string;
  nullifier: string;
  secret: string;
  status: "pending" | "shielded" | "spent";
  timestamp: number;
}

export interface StealthTransfer {
  id: string;
  amount: number;
  from: string;
  stealthAddress: string;
  ephemeralPublicKey: string;
  timestamp: number;
  status: "unclaimed" | "claimed" | "claiming";
}

export interface ActionLog {
  id: string;
  type: "shield" | "withdraw" | "transfer" | "stealth";
  command: string;
  status: "pending" | "processing" | "completed" | "error";
  steps: {
    id: number;
    text: string;
    status: "pending" | "loading" | "completed" | "error";
    timestamp?: number;
  }[];
  timestamp: number;
  privacyLevel: number;
  txHash?: string;
}

interface VaultState {
  // Identity
  accountId: string | null;
  evmAddress: string | null;
  isConnected: boolean;

  // Balance & Privacy
  totalBalance: number;
  privacyMode: boolean;
  privacyScore: number;
  fragments: Fragment[];

  // Stealth
  stealthTransfers: StealthTransfer[];
  unseenStealthCount: number;
  markStealthAsSeen: () => void;
  claimStealthTransfer: (id: string) => void;

  // Actions
  actionLogs: ActionLog[];
  addActionLog: (log: ActionLog) => void;
  updateActionLog: (id: string, updates: Partial<ActionLog>) => void;
  updateActionStep: (logId: string, stepId: number, status: ActionLog["steps"][0]["status"]) => void;

  // Connection
  connect: (accountId: string, evmAddress: string) => void;
  disconnect: () => void;
  setPrivacyMode: (enabled: boolean) => void;
  addFragment: (fragment: Fragment) => void;
  addStealthTransfer: (transfer: StealthTransfer) => void;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set) => ({
      // Identity
      accountId: null,
      evmAddress: null,
      isConnected: false,

      // Balance & Privacy
      totalBalance: 0,  // Will be updated from WalletProvider
      privacyMode: false,
      privacyScore: 0,
      fragments: [],

      // Stealth
      stealthTransfers: [],
      unseenStealthCount: 0,

      markStealthAsSeen: () => set({ unseenStealthCount: 0 }),

      claimStealthTransfer: (id: string) => {
        set((state) => ({
          stealthTransfers: state.stealthTransfers.map((t) =>
            t.id === id ? { ...t, status: "claimed" } : t
          ),
        }));
      },

      // Actions
      actionLogs: [],

      addActionLog: (log) => {
        set((state) => ({
          actionLogs: [...state.actionLogs, log],
        }));
      },

      updateActionLog: (id, updates) => {
        set((state) => ({
          actionLogs: state.actionLogs.map((log) =>
            log.id === id ? { ...log, ...updates } : log
          ),
        }));
      },

      updateActionStep: (logId, stepId, status) => {
        set((state) => ({
          actionLogs: state.actionLogs.map((log) =>
            log.id === logId
              ? {
                  ...log,
                  steps: log.steps.map((step) =>
                    step.id === stepId
                      ? { ...step, status, timestamp: Date.now() }
                      : step
                  ),
                }
              : log
          ),
        }));
      },

      // Connection
      connect: (accountId, evmAddress) =>
        set({ accountId, evmAddress, isConnected: true }),

      disconnect: () =>
        set({ accountId: null, evmAddress: null, isConnected: false }),

      setPrivacyMode: (enabled) => set({ privacyMode: enabled }),

      addFragment: (fragment) => {
        set((state) => ({
          fragments: [...state.fragments, fragment],
          totalBalance: state.totalBalance + fragment.amount,
        }));
      },

      addStealthTransfer: (transfer) => {
        set((state) => ({
          stealthTransfers: [transfer, ...state.stealthTransfers],
          unseenStealthCount: state.unseenStealthCount + 1,
        }));
      },
    }),
    {
      name: "vanish-vault-storage",
      partialize: (state) => ({
        accountId: state.accountId,
        evmAddress: state.evmAddress,
        totalBalance: state.totalBalance,
        fragments: state.fragments,
        stealthTransfers: state.stealthTransfers,
        actionLogs: state.actionLogs.slice(-50), // Keep last 50 actions
      }),
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

// Derived selectors
export const selectShieldedFragments = (state: VaultState) =>
  state.fragments.filter((f) => f.status === "shielded");

export const selectPendingFragments = (state: VaultState) =>
  state.fragments.filter((f) => f.status === "pending");

export const selectUnclaimedStealth = (state: VaultState) =>
  state.stealthTransfers.filter((t) => t.status === "unclaimed");

export const selectTotalShielded = (state: VaultState) =>
  state.fragments
    .filter((f) => f.status === "shielded")
    .reduce((sum, f) => sum + f.amount, 0);
