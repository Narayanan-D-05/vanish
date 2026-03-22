"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "@/contexts/WalletProvider";
import { getStealthTransfers } from "@/lib/api";

interface StealthTransfer {
  id: string;
  amount: number;
  from: string;
  stealthAddress: string;
  status: "unclaimed" | "claimed";
  timestamp?: number;
}

const AGENT_ACCOUNT_ID = process.env.NEXT_PUBLIC_AGENT_ACCOUNT_ID || "0.0.8119040";

export function StealthInbox() {
  const { accountId: walletAccountId } = useWallet();
  const [transfers, setTransfers] = useState<StealthTransfer[]>([]);

  useEffect(() => {
    const fetchTransfers = async () => {
      try {
        const accountId = walletAccountId || AGENT_ACCOUNT_ID;
        const data = await getStealthTransfers(accountId);
        if (data.success && data.transfers) {
          // Only show actual stealth transfers — filter out internal swaps / non-stealth entries
          const stealthOnly = data.transfers
            .filter((t: any) => t.stealthAddress && t.stealthAddress.startsWith("0x"))
            .map((t: any) => ({
              id: t.id,
              amount: t.amount,
              from: t.from,
              stealthAddress: t.stealthAddress || "",
              status: t.status,
              timestamp: t.timestamp,
            }));
          setTransfers(stealthOnly);
        }
      } catch {
        // ignore — backend may not be ready
      }
    };
    fetchTransfers();
    const interval = setInterval(fetchTransfers, 10000);
    return () => clearInterval(interval);
  }, [walletAccountId]);

  // Separate claimed vs pending (auto-claiming)
  const claimed = transfers.filter(t => t.status === "claimed");
  const pending = transfers.filter(t => t.status !== "claimed");
  const pendingCount = pending.length;

  const formatAge = (ts?: number) => {
    if (!ts) return "";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const shortAddr = (addr: string) =>
    addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : "UNKNOWN";

  return (
    <div style={{
      backgroundColor: "#1c1b1d",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minHeight: 400,
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{
        padding: "1.25rem 1.5rem",
        borderBottom: "1px solid rgba(60,73,76,0.15)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#201f22",
        flexShrink: 0,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          margin: 0,
          color: "#e5e1e4",
        }}>Stealth_Inbox</h2>

        {pendingCount > 0 && (
          <motion.span
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{
              background: "rgba(138,235,255,0.12)",
              color: "#8aebff",
              padding: "0.15rem 0.5rem",
              fontSize: "0.6rem",
              fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {pendingCount} AUTO-CLAIMING
          </motion.span>
        )}
      </div>

      {/* Transfer list */}
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <AnimatePresence>
          {transfers.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: 160, color: "#3c3c3c", gap: "0.5rem",
            }}>
              <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.3 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p style={{ fontSize: "0.7rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
                Monitoring for stealth transfers...
              </p>
            </div>
          ) : (
            <>
              {/* Pending auto-claim */}
              {pending.length > 0 && (
                <div>
                  <div style={{
                    padding: "0.5rem 1.5rem",
                    fontSize: "0.55rem",
                    color: "#5a5a5a",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    fontFamily: "'Space Grotesk', sans-serif",
                    borderBottom: "1px solid rgba(60,73,76,0.08)",
                    backgroundColor: "#1a1a1c",
                  }}>
                    ⏳ Pending Auto-Claim ({pending.length})
                  </div>
                  {pending.map((t, i) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        padding: "1rem 1.5rem",
                        borderBottom: "1px solid rgba(60,73,76,0.06)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                        {/* Pulsing pending indicator */}
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          backgroundColor: "#8aebff",
                          animation: "pulse 1.5s infinite",
                          flexShrink: 0,
                        }} />
                        <div style={{ flexGrow: 1 }}>
                          <div style={{
                            fontSize: "0.7rem", fontWeight: 700,
                            fontFamily: "'Space Grotesk', sans-serif",
                            color: "#8aebff", letterSpacing: "0.05em",
                          }}>
                            {t.amount} HBAR
                          </div>
                          <div style={{ fontSize: "0.6rem", color: "#5a5a5a", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                            From: {t.from || "PRIVACY_POOL"} {t.timestamp ? `· ${formatAge(t.timestamp)}` : ""}
                          </div>
                        </div>
                        <span style={{
                          fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase",
                          color: "#8aebff", background: "rgba(138,235,255,0.08)",
                          padding: "0.15rem 0.4rem", letterSpacing: "0.08em",
                          fontFamily: "'Space Grotesk', sans-serif",
                          border: "1px solid rgba(138,235,255,0.15)",
                        }}>
                          AI SWEEPING
                        </span>
                      </div>
                      {/* Stealth address */}
                      <div style={{
                        background: "#0e0e10",
                        padding: "0.4rem 0.75rem",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.6rem",
                        color: "#5a5a5a",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        borderLeft: "2px solid rgba(138,235,255,0.2)",
                      }}>
                        {shortAddr(t.stealthAddress)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Claimed */}
              {claimed.length > 0 && (
                <div>
                  <div style={{
                    padding: "0.5rem 1.5rem",
                    fontSize: "0.55rem",
                    color: "#5a5a5a",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    fontFamily: "'Space Grotesk', sans-serif",
                    borderBottom: "1px solid rgba(60,73,76,0.08)",
                    backgroundColor: "#1a1a1c",
                  }}>
                    ✅ Claimed ({claimed.length})
                  </div>
                  {claimed.map((t, i) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      style={{
                        padding: "1rem 1.5rem",
                        borderBottom: "1px solid rgba(60,73,76,0.06)",
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          backgroundColor: "#32d7c2", flexShrink: 0,
                        }} />
                        <div style={{ flexGrow: 1 }}>
                          <div style={{
                            fontSize: "0.7rem", fontWeight: 700,
                            fontFamily: "'Space Grotesk', sans-serif",
                            color: "#e5e1e4",
                          }}>
                            {t.amount} HBAR
                          </div>
                          <div style={{ fontSize: "0.6rem", color: "#5a5a5a", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                            From: {t.from || "PRIVACY_POOL"} {t.timestamp ? `· ${formatAge(t.timestamp)}` : ""}
                          </div>
                        </div>
                        <span style={{
                          fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase",
                          color: "#32d7c2", background: "rgba(50,215,194,0.08)",
                          padding: "0.15rem 0.4rem", letterSpacing: "0.08em",
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}>
                          SWEPT
                        </span>
                      </div>
                      <div style={{
                        background: "#0e0e10",
                        padding: "0.4rem 0.75rem",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.6rem",
                        color: "#3c3c3c",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        borderLeft: "2px solid rgba(50,215,194,0.15)",
                      }}>
                        {shortAddr(t.stealthAddress)}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Footer note — no action button, auto-claim is the protocol */}
      <div style={{
        padding: "0.75rem 1.5rem",
        borderTop: "1px solid rgba(60,73,76,0.1)",
        fontSize: "0.55rem",
        color: "#3c3c3c",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.05em",
        flexShrink: 0,
      }}>
        🔒 AI agent auto-sweeps with randomised delay · No manual claim
      </div>
    </div>
  );
}
