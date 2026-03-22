"use client";

import { motion } from "framer-motion";
import { Brain, Zap, Terminal, Network } from "lucide-react";

export interface Thought {
  id: string;
  timestamp: number;
  type: "analysis" | "decision" | "action" | "observation" | "thought" | "logic" | "system" | "log" | "error";
  message: string;
  context?: string;
  agent?: string;
}

interface ThoughtStreamProps {
  thoughts: Thought[];
  className?: string;
}

export function ThoughtStream({ thoughts, className = "" }: ThoughtStreamProps) {
  const getThoughtIcon = (type: Thought["type"]) => {
    switch (type) {
      case "analysis":
      case "thought":
        return <Brain className="w-4 h-4 text-cyan-400" />;
      case "decision":
        return <Zap className="w-4 h-4 text-yellow-400" />;
      case "action":
        return <Terminal className="w-4 h-4 text-emerald-400" />;
      case "observation":
      case "logic":
        return <Network className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getThoughtColor = (type: Thought["type"]) => {
    switch (type) {
      case "analysis":
      case "thought":
        return "border-cyan-500/20 bg-cyan-500/5";
      case "decision":
        return "border-yellow-500/20 bg-yellow-500/5";
      case "action":
        return "border-emerald-500/20 bg-emerald-500/5";
      case "observation":
      case "logic":
        return "border-zinc-500/20 bg-zinc-500/5";
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {thoughts.map((thought, index) => (
        <motion.div
          key={thought.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className={`p-3 rounded-lg border ${getThoughtColor(thought.type)}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getThoughtIcon(thought.type)}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  {thought.agent ? `${thought.agent} • ` : ''}{thought.type}
                </span>
                <span className="text-xs text-zinc-600">
                  {new Date(thought.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {thought.message}
              </p>
              {thought.context && (
                <p className="text-xs text-zinc-500 mt-2 font-mono">
                  Context: {thought.context}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
