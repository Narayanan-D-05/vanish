"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Ghost, X, Key, ArrowRight, Unlock, 
  Shield, Check, Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { useWallet } from "@/contexts/WalletProvider";
import { claimStealthTransfer } from "@/lib/api";
import { ShinyText } from "@/components/ui/ShinyText";

interface StealthRevealProps {
  transfer: {
    id: string;
    amount: number;
    from: string;
    stealthAddress?: string;
  };
  onClose: () => void;
}

export function StealthReveal({ transfer, onClose }: StealthRevealProps) {
  const { accountId } = useWallet();
  const [step, setStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (!isAnimating || !accountId) return;

    // Start the claiming process
    const claim = async () => {
      try {
        // Step 1: Detecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        setStep(1);
        
        // Step 2: Call backend API to claim
        const response = await claimStealthTransfer(accountId, transfer.id);
        
        if (response.success) {
          setStep(2);
          await new Promise(resolve => setTimeout(resolve, 1000));
          setStep(3);
          await new Promise(resolve => setTimeout(resolve, 1000));
          setStep(4);
          setIsAnimating(false);
        } else {
          // setError(response.message || "Claim failed"); // Removed as per instruction
          setIsAnimating(false);
        }
      } catch {
        // setError(err instanceof Error ? err.message : "Claim failed"); // Removed as per instruction
        setIsAnimating(false);
      }
    };

    claim();

    return () => {
      // Cleanup if needed
    };
  }, [isAnimating, accountId, transfer.id]);

  const steps = [
    {
      icon: <Ghost className="w-8 h-8 text-cyan-400" />,
      title: "Ghost Address Detected",
      description: `Stealth transfer of ${transfer.amount} HBAR detected from ${transfer.from}`,
      color: "from-cyan-500/20 to-transparent",
    },
    {
      icon: <Key className="w-8 h-8 text-emerald-400" />,
      title: "Deriving Stealth Key",
      description: "Using your View Private Key + Ephemeral Public Key via X25519...",
      color: "from-emerald-500/20 to-transparent",
    },
    {
      icon: <Unlock className="w-8 h-8 text-yellow-400" />,
      title: "Address Unlocked",
      description: "Stealth address derived from X25519 key exchange",
      color: "from-yellow-500/20 to-transparent",
    },
    {
      icon: <ArrowRight className="w-8 h-8 text-violet-400" />,
      title: "Sweeping to Main Account",
      description: "Transferring funds from stealth address to your account 0.0.8119040...",
      color: "from-violet-500/20 to-transparent",
    },
    {
      icon: <Check className="w-8 h-8 text-emerald-400" />,
      title: "Claim Complete!",
      description: `${transfer.amount} HBAR has been successfully claimed and shielded in your vault.`,
      color: "from-emerald-500/20 to-transparent",
    },
  ];

  const currentStep = steps[step];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="bg-black/60 border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-zinc-800">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 via-emerald-500 to-violet-500"
              initial={{ width: "0%" }}
              animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Ghost className="w-5 h-5 text-cyan-400" />
              <ShinyText>Stealth Reveal</ShinyText>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Main Animation Area */}
            <div className="relative h-48 rounded-xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 overflow-hidden">
              {/* Animated background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${currentStep.color} opacity-50`} />
              
              {/* Animated circles */}
              <div className="absolute inset-0 flex items-center justify-center">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-cyan-500/30"
                    initial={{ width: 50, height: 50, opacity: 0 }}
                    animate={{ 
                      width: 200 + i * 50, 
                      height: 200 + i * 50, 
                      opacity: [0, 0.3, 0] 
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 2, 
                      delay: i * 0.5,
                      ease: "easeOut"
                    }}
                  />
                ))}
              </div>

              {/* Center icon with animation */}
              <div className="absolute inset-0 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="relative"
                  >
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-emerald-500 blur-xl opacity-50 rounded-full" />
                    <div className="relative bg-zinc-900 p-4 rounded-full border border-zinc-700">
                      {currentStep.icon}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Step indicators */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                {steps.map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i <= step ? "bg-cyan-400" : "bg-zinc-700"
                    }`}
                    animate={i === step ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1 }}
                  />
                ))}
              </div>
            </div>

            {/* Step description */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center"
              >
                <h3 className="text-xl font-bold text-white mb-2">
                  {currentStep.title}
                </h3>
                <p className="text-zinc-400">
                  {currentStep.description}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Technical details */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500 text-xs mb-1">Amount</p>
                  <p className="text-white font-mono">{transfer.amount} HBAR</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs mb-1">From</p>
                  <p className="text-white font-mono">{transfer.from}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs mb-1">Key Derivation</p>
                  <p className="text-emerald-400 font-mono text-xs">X25519 + secp256k1</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs mb-1">Status</p>
                  <div className="flex items-center gap-1.5">
                    {step === 4 ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Complete</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                        <span className="text-cyan-400">Processing...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 border-zinc-700 text-zinc-400 hover:text-white"
              >
                Close
              </Button>
              {step === 4 && (
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white"
                  onClick={onClose}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  View in Vault
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
