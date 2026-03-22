"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/contexts/WalletProvider";

export function ConfirmationModal() {
  const { pendingAction, confirmAction, cancelAction } = useWallet();

  if (!pendingAction) return null;

  const shortRecipient = pendingAction.recipient.length > 20
    ? `${pendingAction.recipient.slice(0, 10)}...${pendingAction.recipient.slice(-8)}`
    : pendingAction.recipient;

  return (
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-6"
        style={{ background: "rgba(19,19,21,0.4)", backdropFilter: "blur(16px)" }}
      >
        {/* High Security Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-xl bg-[#0e0e10] border border-[#3c494c]/30 shadow-[0_0_80px_rgba(34,211,238,0.15)] relative overflow-hidden"
        >
          {/* Noise texture */}
          <div className="noise-overlay absolute inset-0" />

          {/* Security scanner line */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/50 shadow-[0_0_15px_rgba(34,211,238,0.5)]" />

          <div className="p-8 relative z-10">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary font-label text-[10px] tracking-[0.2em] uppercase">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  SSE Agent Stream: Encrypted
                </div>
                <h2 className="font-headline text-2xl font-bold tracking-tighter text-[#e5e1e4]">
                  CONFIRM SHIELDED<br />TRANSACTION
                </h2>
              </div>
              <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="grid grid-cols-1 gap-1 mb-10">
              <div className="bg-[#1c1b1d] p-5 border-l-2 border-primary/20 hover:bg-[#2a2a2c] transition-colors">
                <p className="text-[#bbc9cd] font-label text-[10px] tracking-widest uppercase mb-1">Asset Distribution</p>
                <p className="text-2xl font-headline font-semibold text-primary">{pendingAction.amount} HBAR</p>
              </div>

              <div className="bg-[#1c1b1d] p-5 border-l-2 border-primary/20 hover:bg-[#2a2a2c] transition-colors">
                <p className="text-[#bbc9cd] font-label text-[10px] tracking-widest uppercase mb-1">Destination</p>
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-[#bbc9cd]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <p className="text-lg font-mono text-[#e5e1e4] tracking-tight">{shortRecipient}</p>
                </div>
              </div>

              <div className="bg-[#1c1b1d] p-5 border-l-2 border-primary/20 hover:bg-[#2a2a2c] transition-colors">
                <p className="text-[#bbc9cd] font-label text-[10px] tracking-widest uppercase mb-1">Privacy Layer</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-tertiary">Zero-Knowledge Proof Generated</span>
                  <svg className="w-4 h-4 text-tertiary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                </div>
              </div>

              {pendingAction.type && (
                <div className="bg-[#1c1b1d] p-5 border-l-2 border-primary/20 hover:bg-[#2a2a2c] transition-colors">
                  <p className="text-[#bbc9cd] font-label text-[10px] tracking-widest uppercase mb-1">Operation Type</p>
                  <p className="text-sm font-headline font-semibold text-[#e5e1e4] uppercase tracking-tight">{pendingAction.type.replace("confirmation-required", "Shield Transaction")}</p>
                </div>
              )}
            </div>

            {/* Warning Block */}
            <div className="flex gap-4 p-4 mb-10 bg-error-container/10 border border-error/10">
              <svg className="w-5 h-5 text-error flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              <p className="text-sm text-error/90 leading-relaxed font-medium">
                Warning: This action is irreversible on the Hedera Consensus Service. Any assets sent to an incorrect stealth address cannot be recovered by the Agent.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => confirmAction(pendingAction.id)}
                className="flex-1 bg-gradient-to-br from-primary to-primary-container h-14 flex items-center justify-center gap-3 text-on-primary font-headline font-bold uppercase tracking-widest transition-all hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] active:scale-[0.98]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
                CONFIRM ACTION
              </button>
              <button
                onClick={() => cancelAction(pendingAction.id)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 h-14 flex items-center justify-center gap-3 text-zinc-300 font-headline font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                ABORT
              </button>
            </div>
          </div>

          {/* Bottom progress decoration */}
          <div className="h-1 w-full bg-surface-container flex">
            <div className="h-full bg-primary w-1/3 animate-pulse" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
