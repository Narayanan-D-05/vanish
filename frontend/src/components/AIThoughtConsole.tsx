/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/WalletProvider";
import { getUserAgentThoughts, sendCommand } from "@/lib/api";

interface Thought {
  id: string;
  type: "analysis" | "decision" | "action" | "observation" | "system" | "log" | "error" | "thought";
  message: string;
  timestamp: number;
  agent?: string;
}

interface Props {
  fullscreen?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `[${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}]`;
}

function getThoughtColor(type: string, agent?: string): string {
  if (type === "thought" || type === "analysis") return "text-cyan-400";
  if (type === "action") return "text-[#5bf4de]"; // tertiary
  if (type === "system") return "text-[#2fd9f4]"; // primary-fixed-dim
  if (type === "error") return "text-error";
  if (agent === "PoolManager") return "text-secondary";
  return "text-zinc-400";
}

function getThoughtLabel(type: string): string {
  if (type === "thought" || type === "analysis") return "[Thought]";
  if (type === "action") return "[Action]";
  if (type === "system") return "[System]";
  if (type === "error") return "[Error]";
  if (type === "decision") return "[Decision]";
  return "[Log]";
}

export function AIThoughtConsole({ fullscreen = false }: Props) {
  const { evmAddress: currentAddress } = useWallet();
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [cmdInput, setCmdInput] = useState("");
  const [cmdLoading, setCmdLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const USER_AGENT_URL = process.env.NEXT_PUBLIC_USER_AGENT_URL || "http://localhost:3001";
    const POOL_MANAGER_URL = process.env.NEXT_PUBLIC_POOL_MANAGER_URL || "http://localhost:3002";

    const userAgentSource = new EventSource(`${USER_AGENT_URL}/api/stream/thoughts`);
    const poolManagerSource = new EventSource(`${POOL_MANAGER_URL}/api/stream/thoughts`);
    setIsConnected(true);

    // Fetch history
    const fetchHistory = async () => {
      try {
        const historyData = await getUserAgentThoughts() as any;
        if (historyData?.thoughts) {
          const mapped = historyData.thoughts.map((t: any) => ({
            id: t.id,
            type: t.type === "thought" || t.type === "logic" ? "thought" : (t.type || "log"),
            message: t.message,
            timestamp: t.timestamp,
            agent: t.agent || "UserAgent",
          }));
          setThoughts(mapped);
        }
      } catch (err) {
        console.warn("Failed to fetch thought history:", err);
      }
    };
    fetchHistory();

    userAgentSource.onmessage = (event) => {
      if (isPaused) return;
      try {
        const logData = JSON.parse(event.data);
        setThoughts(prev => [...prev.slice(-149), {
          id: `ua_${Date.now()}_${Math.random()}`,
          type: logData.type || "log",
          message: logData.text,
          timestamp: new Date(logData.timestamp).getTime(),
          agent: "UserAgent",
        }]);
      } catch { /* ignore */ }
    };

    poolManagerSource.onmessage = (event) => {
      if (isPaused) return;
      try {
        const logData = JSON.parse(event.data);
        setThoughts(prev => [...prev.slice(-149), {
          id: `pm_${Date.now()}_${Math.random()}`,
          type: logData.type || "log",
          message: logData.text,
          timestamp: new Date(logData.timestamp).getTime(),
          agent: "PoolManager",
        }]);
      } catch { /* ignore */ }
    };

    userAgentSource.onerror = () => console.warn("UserAgent SSE connection error");
    poolManagerSource.onerror = () => console.warn("PoolManager SSE connection error");

    return () => {
      userAgentSource.close();
      poolManagerSource.close();
      setIsConnected(false);
    };
  }, [currentAddress]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts, isPaused]);

  const isThinking = isConnected && thoughts.length > 0 &&
    (Date.now() - thoughts[thoughts.length - 1].timestamp < 30000);

  if (!fullscreen) {
    // Mini footer version — just shows the last thought
    const lastThought = thoughts[thoughts.length - 1];
    return (
      <div className="flex items-center gap-3 text-primary text-[10px] uppercase tracking-widest font-mono-tech">
        <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
        <span>AIThoughtConsole:</span>
        <span className="text-[#bbc9cd] italic normal-case">
          {lastThought ? lastThought.message.slice(0, 100) : "Waiting for secure seed derivation to initialize agent memory clusters..."}
        </span>
      </div>
    );
  }

  // Full AI Thought Console (logs view)
  return (
    <div className="flex flex-col h-full bg-[#131315] relative">
      <div className="noise-overlay absolute inset-0 z-0" />

      {/* Terminal Header */}
      <div className="z-10 px-8 py-4 bg-[#1c1b1d] flex justify-between items-center border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline font-bold text-lg tracking-tight text-[#e5e1e4]">AI Thought Console</h1>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isThinking ? "bg-cyan-400 animate-pulse" : "bg-zinc-600"}`} />
            <span className="font-mono-tech text-[10px] text-cyan-400/70 uppercase">
              {isThinking ? "Node-Stream: Shard-12-Gamma" : "STANDBY"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPaused(p => !p)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2c] hover:bg-[#39393b] text-[#bbc9cd] font-headline text-[10px] uppercase tracking-widest transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isPaused
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              }
            </svg>
            {isPaused ? "Resume Stream" : "Pause Thought Stream"}
          </button>
          <button
            onClick={() => {
              const blob = new Blob([thoughts.map(t => `${formatTime(t.timestamp)} ${t.agent} ${t.message}`).join("\n")], { type: "text/plain" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `vanish-logs-${Date.now()}.txt`;
              a.click();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary font-headline text-[10px] uppercase tracking-widest transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Logs
          </button>
        </div>
      </div>

      {/* Terminal Window */}
      <div
        ref={scrollRef}
        className="flex-1 z-10 p-8 overflow-y-auto font-mono-tech text-sm leading-relaxed bg-[#0e0e10]"
      >
        <div className="max-w-5xl space-y-2">
          {thoughts.length === 0 ? (
            <div className="flex gap-4 opacity-40">
              <span className="text-zinc-600 min-w-[130px]">[--:--:--.---]</span>
              <span className="text-zinc-400 uppercase">[Kernel] Waiting for agent connection...</span>
            </div>
          ) : (
            thoughts.map((thought, i) => {
              const lines = thought.message
                .replace(/\\n/g, "\n")
                .split("\n")
                .filter((l, li, arr) => !(l.trim() === "" && arr[li - 1]?.trim() === ""));
              const isLast = i === thoughts.length - 1;
              return (
                <div key={thought.id} className={i < 3 ? "opacity-50" : ""}>
                  <div className="flex gap-4">
                    <span className="text-zinc-600 min-w-[130px] flex-shrink-0 text-xs">
                      {formatTime(thought.timestamp)}
                    </span>
                    <span className={`${getThoughtColor(thought.type, thought.agent)} break-all`}>
                      <span className="opacity-60 text-[10px] mr-1">{getThoughtLabel(thought.type)}</span>
                      {thought.agent && <span className="text-zinc-600 text-[10px] mr-1">[{thought.agent}]</span>}
                      {lines[0]}
                      {lines.length === 1 && isLast && <span className="cursor-blink ml-1" />}
                    </span>
                  </div>
                  {lines.slice(1).map((line, li) => (
                    <div key={li} className="flex gap-4">
                      <span className="min-w-[130px] flex-shrink-0" />
                      {line.trim() === ""
                        ? <span className="h-2 block" />
                        : <span className={`${getThoughtColor(thought.type, thought.agent)} break-all text-sm`}>
                            {line}
                            {isLast && li === lines.length - 2 && <span className="cursor-blink ml-1" />}
                          </span>
                      }
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Command Input Bar ── */}
      <div style={{ zIndex: 10, flexShrink: 0, backgroundColor: "#0e0e10", borderTop: "1px solid rgba(60,73,76,0.2)", padding: "0.75rem 2rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <span style={{ color: "#8aebff", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", userSelect: "none", flexShrink: 0 }}>❯</span>
        <input
          value={cmdInput}
          onChange={e => setCmdInput(e.target.value)}
          onKeyDown={async e => {
            if (e.key === "Enter" && cmdInput.trim() && currentAddress) {
              const cmd = cmdInput.trim();
              setCmdInput("");
              setCmdLoading(true);
              setThoughts(prev => [...prev, { id: `cmd_${Date.now()}`, type: "action", message: `> ${cmd}`, timestamp: Date.now(), agent: "UserAgent" }]);
              try {
                const res = await sendCommand(currentAddress, cmd) as any;
                setThoughts(prev => [...prev, { id: `res_${Date.now()}`, type: "system", message: res?.message || res?.result || "Command dispatched.", timestamp: Date.now(), agent: "UserAgent" }]);
              } catch (err) {
                setThoughts(prev => [...prev, { id: `err_${Date.now()}`, type: "error", message: `Error: ${err instanceof Error ? err.message : "Failed"}`, timestamp: Date.now(), agent: "UserAgent" }]);
              } finally {
                setCmdLoading(false);
              }
            }
          }}
          placeholder={currentAddress ? "Type a command (e.g. balance, ai-shield 10, status)" : "Connect wallet to use terminal"}
          disabled={!currentAddress || cmdLoading}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "#e5e1e4", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem",
            caretColor: "#8aebff",
          }}
        />
        {cmdLoading && <span style={{ color: "#8aebff", fontSize: "0.7rem", fontFamily: "'JetBrains Mono', monospace", animation: "pulse 1s infinite" }}>executing...</span>}
      </div>

      {/* Terminal Footer Stat Bar */}
      <div className="z-10 px-8 py-2 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center flex-shrink-0">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-headline text-zinc-500 uppercase">Status:</span>
            <span className={`text-[10px] font-mono-tech uppercase ${isThinking ? "text-tertiary" : "text-zinc-500"}`}>
              {isThinking ? "Synchronized" : "Standby"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-headline text-zinc-500 uppercase">Thoughts:</span>
            <span className="text-[10px] font-mono-tech text-cyan-400">{thoughts.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-headline text-zinc-500 uppercase">Stream:</span>
            <span className={`text-[10px] font-mono-tech ${isPaused ? "text-zinc-500" : "text-primary"}`}>
              {isPaused ? "PAUSED" : "ACTIVE"}
            </span>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-[10px] font-mono-tech text-zinc-600 uppercase">Line: {thoughts.length.toLocaleString()}</span>
          <span className="text-[10px] font-mono-tech text-zinc-600 uppercase">UTF-8 / Crypt-N</span>
        </div>
      </div>
    </div>
  );
}
