"use client";

import { motion } from "framer-motion";
import { Shield, Ghost, Network, Zap, Wallet, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletProvider";
import { ShinyText } from "@/components/ui/ShinyText";
import { useState } from "react";

export function Header() {
  const { accountId, isConnected, connectHashPack, connectMetaMask, disconnect, balance, isProvisioning } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectHashPack = async () => {
    setIsConnecting(true);
    try {
      await connectHashPack();
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectMetaMask = async () => {
    setIsConnecting(true);
    try {
      await connectMetaMask();
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-white/10 bg-black/40 backdrop-blur-3xl sticky top-0 z-50 shadow-lg shadow-black/20"
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
              <div className="relative bg-gradient-to-br from-emerald-500 to-cyan-500 p-2 rounded-lg">
                <Ghost className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tighter">
                <ShinyText className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text">VANISH</ShinyText>
              </h1>
              <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase opacity-70">AI-Powered Privacy</p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-zinc-400">Hedera Testnet</span>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-zinc-400">AI Agent</span>
              <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 text-xs">
                ONLINE
              </Badge>
            </div>

            {/* Wallet Connection */}
            {isConnected && accountId ? (
              <div className="flex items-center gap-3">
                <div className="px-3 py-1.5 bg-white/[0.03] rounded-lg border border-white/10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-zinc-300 font-mono">
                      {accountId.length > 15 
                        ? `${accountId.slice(0, 6)}...${accountId.slice(-6)}`
                        : accountId}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 text-right font-mono opacity-80">
                    {balance.toFixed(2)} HBAR
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={disconnect}
                  className="text-zinc-400 hover:text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleConnectHashPack}
                  disabled={isConnecting || isProvisioning}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white text-sm"
                >
                  {isConnecting || isProvisioning ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      <Zap className="w-4 h-4" />
                    </motion.div>
                  ) : (
                    <Wallet className="w-4 h-4 mr-2" />
                  )}
                  HashPack
                </Button>
                <Button
                  onClick={handleConnectMetaMask}
                  disabled={isConnecting || isProvisioning}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm"
                >
                  MetaMask
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  );
}
