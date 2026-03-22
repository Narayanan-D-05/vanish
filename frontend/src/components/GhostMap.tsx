"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Shield, Globe, ArrowRight, 
  Hash, Activity, Lock, FileKey, Radio
} from "lucide-react";
import { getMerkleTreeState, getNetworkStats, getRecentTransactions } from "@/lib/api";
import { ShinyText } from "@/components/ui/ShinyText";

// Animated Merkle Tree Node
function TreeNode({ 
  level, 
  index, 
  totalNodes, 
  isActive 
}: { 
  level: number; 
  index: number; 
  totalNodes: number;
  isActive: boolean;
}) {
  const spacing = 100 / (totalNodes + 1);
  
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: isActive ? 1 : 0.6, 
        opacity: isActive ? 1 : 0.3 
      }}
      transition={{ delay: index * 0.05 }}
      className={`
        absolute w-3 h-3 rounded-full 
        ${level === 0 ? "bg-emerald-500" : "bg-cyan-500"}
        ${isActive ? "shadow-lg shadow-cyan-500/50" : ""}
      `}
      style={{
        left: `${spacing * (index + 1)}%`,
        top: `${level * 25}%`,
      }}
    />
  );
}

// Merkle Tree Visualization
function MerkleTreeViz() {
  const [activeNodes] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    const fetchMerkleState = async () => {
      try {
        await getMerkleTreeState();
      } catch (error) {
        console.error("Failed to fetch merkle tree state:", error);
      }
    };
    
    fetchMerkleState();
    const interval = setInterval(fetchMerkleState, 5000);
    return () => clearInterval(interval);
  }, []);

  const levels = [8, 4, 2, 1]; // Number of nodes at each level

  return (
    <div className="relative h-40 w-full bg-zinc-950/50 rounded-lg border border-zinc-800/50 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full p-4">
          {/* Connection Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {levels.map((_, levelIndex) => 
              Array.from({ length: levels[levelIndex] }).map((_, nodeIndex) => {
                if (levelIndex === 3) return null;
                const x1 = ((nodeIndex + 0.5) / levels[levelIndex]) * 100;
                const x2 = ((Math.floor(nodeIndex / 2) + 0.5) / levels[levelIndex + 1]) * 100;
                const y1 = (levelIndex / 3) * 100;
                const y2 = ((levelIndex + 1) / 3) * 100;
                
                return (
                  <motion.line
                    key={`line-${levelIndex}-${nodeIndex}`}
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-zinc-800"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: levelIndex * 0.2 }}
                  />
                );
              })
            )}
          </svg>

          {/* Nodes */}
          {levels.map((nodeCount, levelIndex) => (
            <div key={levelIndex} className="absolute w-full" style={{ top: `${(levelIndex / 3) * 100}%` }}>
              {Array.from({ length: nodeCount }).map((_, nodeIndex) => (
                <TreeNode
                  key={`node-${levelIndex}-${nodeIndex}`}
                  level={levelIndex}
                  index={nodeIndex}
                  totalNodes={nodeCount}
                  isActive={activeNodes.has(`${levelIndex}-${nodeIndex}`)}
                />
              ))}
            </div>
          ))}

          {/* Root Label */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
              <Lock className="w-3 h-3 mr-1" />
              Merkle Root
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mock transaction data
export function GhostMap() {
  const [activeTab, setActiveTab] = useState<"network" | "transactions">("network");
  const [merkleState, setMerkleState] = useState({ root: "", depth: 4, leafCount: 0, pendingCount: 0 });
  const [networkStats, setNetworkStats] = useState({
    anonymitySet: 0,
    poolSize: 0,
    pendingActions: 0,
    totalVolume: 0
  });
  const [transactions, setTransactions] = useState<{
    id: string;
    type: "shield" | "withdraw" | "transfer" | "stealth";
    amount: string;
    timestamp: number;
    hashscanUrl: string;
  }[]>([]);

  // Fetch real data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [merkleData, statsData, txData] = await Promise.all([
          getMerkleTreeState(),
          getNetworkStats(),
          getRecentTransactions()
        ]);

        setMerkleState(merkleData);
        setNetworkStats(statsData);
        setTransactions(txData.transactions || []);
      } catch (error) {
        console.error("Failed to fetch GhostMap data:", error);
        // Set error state to show user something went wrong
        setNetworkStats(prev => ({
          ...prev,
          poolSize: -1, // Use -1 to indicate error state
        }));
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Merkle Tree Card */}
      <Card className="bg-black/60 border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden ring-1 ring-cyan-500/10">
        <CardHeader className="pb-2 border-b border-white/5 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 flex items-center gap-2 uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <ShinyText>Ghost Map</ShinyText>
            </CardTitle>
            <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">
              <Activity className="w-3 h-3 mr-1" />
              Depth 4
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <MerkleTreeViz />
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-zinc-800/50">
              <p className="text-zinc-500">Total Leaves</p>
              <p className="text-emerald-400 font-mono">{(merkleState?.leafCount || 0)} / {2 ** (merkleState?.depth || 4)}</p>
            </div>
            <div className="p-2 rounded bg-zinc-800/50">
              <p className="text-zinc-500">Last Root</p>
              <p className="text-cyan-400 font-mono">{(merkleState?.root || "").slice(0, 6)}...</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shadow Transaction Feed */}
      <Card className="bg-black/60 border-white/10 backdrop-blur-3xl shadow-2xl flex-1 overflow-hidden ring-1 ring-cyan-500/10">
        <CardHeader className="pb-2 border-b border-white/5 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-zinc-500 flex items-center gap-2 uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              <ShinyText>Shadow Feed</ShinyText>
            </CardTitle>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("network")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  activeTab === "network" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Network
              </button>
              <button
                onClick={() => setActiveTab("transactions")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  activeTab === "transactions" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Activity
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {/* Section: Private Transactions */}
              <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider">
                <Shield className="w-3 h-3 text-emerald-400" />
                Private Actions
              </div>
              
              {transactions.filter(tx => ["shield", "withdraw", "stealth"].includes(tx.type)).map((tx, index) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-sm font-medium text-emerald-400">{tx.type}</span>
                    </div>
                    <span className="text-xs text-zinc-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{tx.amount}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <FileKey className="w-3 h-3 text-zinc-600" />
                    <span className="text-xs text-zinc-600 font-mono">{tx.id}</span>
                  </div>
                </motion.div>
              ))}

              <div className="my-4 border-t border-zinc-800" />

              {/* Section: Public Transactions */}
              <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wider">
                <Globe className="w-3 h-3 text-zinc-400" />
                Public Network
              </div>

              {transactions.filter(tx => tx.type === "transfer").map((tx, index) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (index + transactions.filter(t => ["shield", "withdraw", "stealth"].includes(t.type)).length) * 0.1 }}
                  className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">{tx.type}</span>
                    <span className="text-xs text-zinc-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{tx.amount}</span>
                    <a 
                      href={`https://hashscan.io/testnet/transaction/${tx.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Hash className="w-3 h-3" />
                      HashScan
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                </motion.div>
              ))}
            </div>
          </ScrollArea>

          {/* Pool Stats */}
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-zinc-500">Anonymity Set</p>
                <p className="text-sm font-medium text-emerald-400">{networkStats.anonymitySet}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Pending</p>
                <p className="text-sm font-medium text-cyan-400">{networkStats.pendingActions}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Pool Size</p>
                <p className="text-sm font-medium text-zinc-300">{(networkStats?.poolSize || 0).toFixed(1)} HBAR</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HCS Connection Status */}
      <Card className="bg-black/40 border-white/10 backdrop-blur-2xl shadow-xl">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full animate-pulse" />
              <Radio className="w-5 h-5 text-cyan-400 relative z-10" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">HCS Topic 0.0.8210357</p>
              <p className="text-xs text-zinc-500">Listening for encrypted proofs...</p>
            </div>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse delay-75" />
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse delay-150" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
