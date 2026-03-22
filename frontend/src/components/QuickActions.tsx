"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Send, VenetianMask, ArrowDownToLine, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QuickActionsProps {
  onExecute: (command: string) => void;
  disabled?: boolean;
}

type ActionType = "shield" | "transfer" | "stealth" | "withdraw" | null;

export function QuickActions({ onExecute, disabled }: QuickActionsProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const handleActionClick = (type: ActionType) => {
    if (activeAction === type) {
      setActiveAction(null);
    } else {
      setActiveAction(type);
      setAmount("");
      setRecipient("");
    }
  };

  const handleConfirm = () => {
    if (!amount) return;

    let command = "";
    switch (activeAction) {
      case "shield":
        command = `ai-shield ${amount}`;
        break;
      case "transfer":
        command = `transfer ${recipient} ${amount}`;
        break;
      case "stealth":
        command = `stealth ${recipient} ${amount}`;
        break;
      case "withdraw":
        command = `withdraw ${amount} to ${recipient}`;
        break;
    }

    if (command) {
      onExecute(command);
      setActiveAction(null);
      setAmount("");
      setRecipient("");
    }
  };

  const actions = [
    { id: "shield", label: "Shield", icon: <Shield className="w-4 h-4" />, color: "text-emerald-400", border: "border-emerald-500/20" },
    { id: "transfer", label: "Transfer", icon: <Send className="w-4 h-4" />, color: "text-violet-400", border: "border-violet-500/20" },
    { id: "stealth", label: "Stealth", icon: <VenetianMask className="w-4 h-4" />, color: "text-pink-400", border: "border-pink-500/20" },
    { id: "withdraw", label: "Withdraw", icon: <ArrowDownToLine className="w-4 h-4" />, color: "text-cyan-400", border: "border-cyan-500/20" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            disabled={disabled}
            className={`
              h-auto py-3 px-2 flex flex-col gap-2 bg-black/40 border-white/5 hover:bg-white/5 hover:border-white/20 transition-all
              ${activeAction === action.id ? "ring-2 ring-cyan-500/40 border-cyan-500/40 bg-white/5" : ""}
            `}
            onClick={() => handleActionClick(action.id as ActionType)}
          >
            <div className={`p-2 rounded-lg bg-white/5 ${action.color}`}>
              {action.icon}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              {action.label}
            </span>
          </Button>
        ))}
      </div>

      <AnimatePresence>
        {activeAction && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-300 capitalize">
                  {activeAction} Transaction
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 hover:bg-white/10" 
                  onClick={() => setActiveAction(null)}
                >
                  <X className="w-3 h-3 text-zinc-500" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(activeAction === "transfer" || activeAction === "stealth" || activeAction === "withdraw") && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest pl-1">
                      Recipient Account / Address
                    </label>
                    <Input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder={activeAction === "withdraw" ? "0.0.xxxxxx" : "Recipient Account"}
                      className="bg-black/50 border-white/10 text-sm h-10"
                    />
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest pl-1">
                    Amount (HBAR)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="bg-black/50 border-white/10 text-sm h-10 flex-1"
                    />
                    <Button 
                      onClick={handleConfirm}
                      disabled={!amount || ((activeAction !== "shield") && !recipient)}
                      className="bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600 px-4"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
