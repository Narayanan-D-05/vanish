/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Send, VenetianMask, Loader2, ChevronRight } from "lucide-react";
import { useWallet } from "@/contexts/WalletProvider";
import { sendCommand } from "@/lib/api";

interface ActionStep {
  id: number;
  text: string;
  status: "loading" | "completed" | "error";
}

interface RunningAction {
  id: string;
  type: "shield" | "transfer" | "stealth";
  command: string;
  steps: ActionStep[];
  status: "processing" | "completed" | "error";
  timestamp: number;
}

const ACTIONS = [
  {
    id: "shield",
    type: "shield" as const,
    label: "Shield",
    sublabel: "ZK-fragment assets into pool",
    icon: Shield,
    accentColor: "#8aebff",
    accentBg: "rgba(138,235,255,0.06)",
    accentBorder: "rgba(138,235,255,0.15)",
    placeholder: "Amount (e.g. 10)",
    fields: [{ key: "amount", label: "HBAR Amount", placeholder: "10" }],
    buildCommand: (vals: Record<string, string>) => `ai-shield ${vals.amount}`,
  },
  {
    id: "transfer",
    type: "transfer" as const,
    label: "Transfer",
    sublabel: "Internal pool transfer",
    icon: Send,
    accentColor: "#5bf4de",
    accentBg: "rgba(91,244,222,0.06)",
    accentBorder: "rgba(91,244,222,0.15)",
    placeholder: "Recipient address",
    fields: [
      { key: "to", label: "Recipient", placeholder: "0.0.12345" },
      { key: "amount", label: "HBAR Amount", placeholder: "5" },
    ],
    buildCommand: (vals: Record<string, string>) => `internal-transfer ${vals.to} ${vals.amount}`,
  },
  {
    id: "stealth",
    type: "stealth" as const,
    label: "Stealth",
    sublabel: "One-time stealth address sweep",
    icon: VenetianMask,
    accentColor: "#c6c5cf",
    accentBg: "rgba(198,197,207,0.06)",
    accentBorder: "rgba(198,197,207,0.15)",
    placeholder: "Recipient + Amount",
    fields: [
      { key: "to", label: "Recipient", placeholder: "0.0.12345" },
      { key: "amount", label: "HBAR Amount", placeholder: "5" },
    ],
    buildCommand: (vals: Record<string, string>) => `stealth ${vals.to} ${vals.amount}`,
  },
];

const STORAGE_KEY = "vanish_action_log";

export function ActionTheater() {
  const { accountId, evmAddress, isConnected } = useWallet();
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({}); 
  const [runningActions, setRunningActionsRaw] = useState<RunningAction[]>(() => {
    // Hydrate from sessionStorage on first mount so logs survive tab/view switches
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);

  // Wrapper: update state AND persist to sessionStorage
  const setRunningActions = (updater: RunningAction[] | ((prev: RunningAction[]) => RunningAction[])) => {
    setRunningActionsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full */ }
      return next;
    });
  };

  // SSE listener for success signals
  useEffect(() => {
    if (!isConnected) return;
    const URL = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
    const src = new EventSource(`${URL}/api/stream/thoughts`);
    src.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const text = (data.text || "").toLowerCase();
        const isSuccess =
          text.includes("batch anchored") ||
          text.includes("ritual complete") ||
          text.includes("submission complete") ||
          text.includes("link ready") ||
          text.includes("funds settled");
        if (isSuccess) {
          setRunningActions(prev => {
            const idx = [...prev].reverse().findIndex(c => c.status === "processing");
            if (idx === -1) return prev;
            const actualIdx = prev.length - 1 - idx;
            return prev.map((a, i) =>
              i === actualIdx
                ? { ...a, status: "completed", steps: a.steps.map(s => ({ ...s, status: "completed" as const })) }
                : a
            );
          });
        }
      } catch { /* ignore */ }
    };
    return () => src.close();
  }, [isConnected, accountId]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [runningActions]);

  const getFieldValues = (actionId: string) => fieldValues[actionId] || {};
  const setField = (actionId: string, key: string, value: string) =>
    setFieldValues(prev => ({ ...prev, [actionId]: { ...(prev[actionId] || {}), [key]: value } }));

  const execute = async (action: typeof ACTIONS[0]) => {
    if (!evmAddress || isProcessing) return;
    const vals = getFieldValues(action.id);
    const missing = action.fields.find(f => !vals[f.key]?.trim());
    if (missing) return;

    const command = action.buildCommand(vals);
    const rid = `action_${Date.now()}`;

    setRunningActions(prev => [
      { id: rid, type: action.type, command, steps: [{ id: 1, text: "Analyzing network privacy...", status: "loading" as const }], status: "processing" as const, timestamp: Date.now() },
      ...prev,
    ].slice(0, 10));

    setIsProcessing(true);
    setActiveCard(null);

    try {
      const response = await sendCommand(evmAddress!, command);
      if (response.success) {
        const isAction = /\b(shield|transfer|stealth|swap|internal-transfer)\b/i.test(command);
        setRunningActions(prev => prev.map(a =>
          a.id === rid
            ? isAction
              ? { ...a, steps: [...a.steps.map(s => ({ ...s, status: "completed" as const })), { id: Date.now(), text: "Ritual initiated — awaiting on-chain confirmation...", status: "loading" as const }] }
              : { ...a, status: "completed", steps: a.steps.map(s => ({ ...s, status: "completed" as const })) }
            : a
        ));
      } else {
        throw new Error((response as any).error || "Command failed");
      }
    } catch (err) {
      setRunningActions(prev => prev.map(a =>
        a.id === rid
          ? { ...a, status: "error", steps: [...a.steps.map(s => s.status === "loading" ? { ...s, status: "error" as const } : s), { id: Date.now(), text: `Error: ${err instanceof Error ? err.message : "Failed"}`, status: "error" as const }] }
          : a
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* ── 3 Action Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {ACTIONS.map(action => {
          const Icon = action.icon;
          const isOpen = activeCard === action.id;
          const vals = getFieldValues(action.id);
          const allFilled = action.fields.every(f => vals[f.key]?.trim());

          return (
            <div
              key={action.id}
              style={{
                backgroundColor: "#1c1b1d",
                border: `1px solid ${isOpen ? action.accentBorder : "rgba(60,73,76,0.12)"}`,
                transition: "border-color 0.2s",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Card header / toggle */}
              <button
                onClick={() => setActiveCard(isOpen ? null : action.id)}
                disabled={!isConnected}
                style={{
                  width: "100%",
                  padding: "1.5rem",
                  textAlign: "left",
                  background: isOpen ? action.accentBg : "transparent",
                  border: "none",
                  cursor: isConnected ? "pointer" : "not-allowed",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  transition: "background 0.2s",
                  opacity: isConnected ? 1 : 0.4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ padding: "0.6rem", backgroundColor: action.accentBg, border: `1px solid ${action.accentBorder}` }}>
                    <Icon style={{ width: 20, height: 20, color: action.accentColor }} />
                  </div>
                  <ChevronRight
                    style={{
                      width: 16, height: 16, color: action.accentColor,
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                      opacity: isOpen ? 1 : 0.3,
                    }}
                  />
                </div>
                <div>
                  <div style={{ color: "#e5e1e4", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {action.label}
                  </div>
                  <div style={{ color: "#5a5a5a", fontSize: "0.7rem", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "0.2rem" }}>
                    {action.sublabel}
                  </div>
                </div>
              </button>

              {/* Expandable input form */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ padding: "0 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: `1px solid ${action.accentBorder}` }}>
                      {action.fields.map(field => (
                        <div key={field.key} style={{ paddingTop: "0.75rem" }}>
                          <label style={{ display: "block", fontSize: "0.6rem", color: "#5a5a5a", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.4rem" }}>
                            {field.label}
                          </label>
                          <input
                            type="text"
                            value={vals[field.key] || ""}
                            onChange={e => setField(action.id, field.key, e.target.value)}
                            placeholder={field.placeholder}
                            onKeyDown={e => e.key === "Enter" && allFilled && execute(action)}
                            style={{
                              width: "100%", padding: "0.6rem 0.75rem",
                              backgroundColor: "#0e0e10", border: `1px solid ${action.accentBorder}`,
                              color: "#e5e1e4", fontSize: "0.85rem",
                              fontFamily: "'JetBrains Mono', monospace", outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => execute(action)}
                        disabled={!allFilled || isProcessing}
                        style={{
                          marginTop: "0.25rem", padding: "0.75rem",
                          backgroundColor: allFilled && !isProcessing ? action.accentColor : "rgba(60,73,76,0.2)",
                          color: allFilled && !isProcessing ? "#00363e" : "#3a3a3c",
                          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                          fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em",
                          border: "none", cursor: allFilled && !isProcessing ? "pointer" : "not-allowed",
                          transition: "all 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                        }}
                      >
                        {isProcessing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : null}
                        Execute {action.label}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ── Running Actions Log ── */}
      {runningActions.length > 0 && (
        <div style={{ backgroundColor: "#1c1b1d", border: "1px solid rgba(60,73,76,0.12)" }}>
          <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(60,73,76,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#201f22" }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#e5e1e4" }}>
              Execution Log
            </span>
            <button onClick={() => setRunningActions([])} style={{ background: "none", border: "none", cursor: "pointer", color: "#5a5a5a", fontSize: "0.7rem", fontFamily: "'Space Grotesk', sans-serif" }}>
              Clear
            </button>
          </div>
          <div ref={logsRef} style={{ maxHeight: "16rem", overflowY: "auto", padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {runningActions.map(action => (
              <div key={action.id} style={{ borderLeft: `2px solid ${action.status === "completed" ? "#5bf4de" : action.status === "error" ? "rgba(255,180,171,0.5)" : "#8aebff"}`, paddingLeft: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", color: "#8aebff" }}>{action.command}</span>
                  <span style={{
                    fontSize: "0.6rem", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, textTransform: "uppercase",
                    color: action.status === "completed" ? "#5bf4de" : action.status === "error" ? "#ffb4ab" : "#8aebff",
                  }}>
                    {action.status === "processing" ? "● ACTIVE" : action.status.toUpperCase()}
                  </span>
                </div>
                {action.steps.map(step => (
                  <div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: step.status === "completed" ? "#5bf4de" : step.status === "error" ? "#ffb4ab" : "#8aebff", fontSize: "0.7rem", marginTop: 2 }}>
                      {step.status === "completed" ? "✓" : step.status === "error" ? "✗" : "…"}
                    </span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "#bbc9cd" }}>{step.text}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not connected guard */}
      {!isConnected && (
        <div style={{ textAlign: "center", padding: "3rem", color: "#3c3c3c", fontSize: "0.8rem", fontFamily: "'Inter', sans-serif" }}>
          Connect wallet to use action theater
        </div>
      )}
    </div>
  );
}
