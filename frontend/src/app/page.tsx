"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { IdentityVault } from "@/components/IdentityVault";
import { ActionTheater } from "@/components/ActionTheater";
import { GhostMap } from "@/components/GhostMap";
import { AIThoughtConsole } from "@/components/AIThoughtConsole";
import { StealthReveal } from "@/components/StealthReveal";
import { StealthInbox } from "@/components/StealthInbox";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { LandingPage } from "@/components/LandingPage";
import { useWallet } from "@/contexts/WalletProvider";
import { Fingerprint, Zap, Map, Settings, Terminal, LogOut, Wallet } from "lucide-react";

interface StealthTransfer {
  id: string;
  amount: number;
  from: string;
  stealthAddress?: string;
}

type ActiveView = "vault" | "theater" | "map" | "logs";

export default function Home() {
  const {
    accountId,
    isConnected,
    balance,
    isProvisioning,
    connectMetaMask,
    connectHashPack,
    disconnect,
  } = useWallet();

  const [activeView, setActiveView] = useState<ActiveView>("vault");
  const [showStealthReveal, setShowStealthReveal] = useState(false);
  const [selectedStealthTransfer, setSelectedStealthTransfer] = useState<StealthTransfer | null>(null);
  const [isConnecting, setIsConnecting] = useState<"metamask" | "hashpack" | null>(null);

  const handleClaimStealth = (transfer: StealthTransfer) => {
    setSelectedStealthTransfer(transfer);
    setShowStealthReveal(true);
  };

  const handleConnectMetaMask = async () => {
    setIsConnecting("metamask");
    try { await connectMetaMask(); } catch (e) { console.error(e); } finally { setIsConnecting(null); }
  };

  const handleConnectHashPack = async () => {
    setIsConnecting("hashpack");
    try { await connectHashPack(); } catch (e) { console.error(e); } finally { setIsConnecting(null); }
  };

  const shortAddress = accountId
    ? accountId.length > 15 ? `${accountId.slice(0, 8)}...${accountId.slice(-6)}` : accountId
    : null;

  const sideNavItems = [
    { id: "vault" as ActiveView, label: "Identity", icon: Fingerprint },
    { id: "theater" as ActiveView, label: "Actions", icon: Zap },
    { id: "map" as ActiveView, label: "Network", icon: Map },
  ];

  // ── Show Landing Page when not connected (and not provisioning) ──
  if (!isConnected && !isProvisioning) {
    return <LandingPage />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#131315] text-[#e5e1e4] font-body">

      {/* ── Top Nav Bar ── */}
      <nav className="fixed top-0 w-full z-50 bg-zinc-950/60 backdrop-blur-md border-b border-cyan-500/10 shadow-[0_4px_20px_rgba(34,211,238,0.05)] flex justify-between items-center px-6 h-16">
        <div className="text-2xl font-bold tracking-tighter text-primary uppercase font-headline">VANISH</div>

        <div className="hidden md:flex items-center gap-8 font-headline tracking-tight text-sm uppercase">
          {sideNavItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`transition-colors pb-1 ${activeView === item.id
                ? "text-primary border-b-2 border-primary"
                : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {item.id === "vault" ? "Vault" : item.id === "theater" ? "Theater" : "Map"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {isConnected && accountId ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs text-primary font-bold uppercase tracking-tighter font-headline">Agent Active</span>
              </div>
              <div className="flex items-center gap-2 text-on-surface-variant text-xs font-mono-tech bg-surface-container px-3 py-1">
                <Wallet className="w-3 h-3" />
                <span>{shortAddress}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-primary">{balance.toFixed(2)} HBAR</span>
              </div>
              <button onClick={disconnect} className="p-2 text-zinc-600 hover:text-red-400 transition-colors" title="Disconnect">
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : null}
        </div>
      </nav>

      {/* ── Sidebar + Content ── */}
      <div className="flex flex-1 pt-16 pb-8 overflow-hidden">

        {/* Sidebar */}
        <aside className="fixed left-0 top-16 h-[calc(100vh-8rem)] w-20 md:w-64 z-40 bg-zinc-950/80 backdrop-blur-lg flex flex-col py-8 gap-4 font-headline text-xs uppercase tracking-widest">
          <div className="px-6 mb-4 hidden md:block">
            <div className="text-xs font-bold text-primary tracking-widest">
              {accountId ? `${accountId.slice(0, 12)}...` : "SENTINEL"}
            </div>
            <div className="text-[10px] text-zinc-600">HEDERA_NODE_v4</div>
          </div>

          <nav className="flex flex-col w-full flex-1">
            {sideNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`flex items-center gap-4 px-6 py-4 transition-all active:scale-95 text-left ${isActive
                    ? "bg-primary/10 text-primary border-r-2 border-primary"
                    : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/50"}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-1 px-4 border-t border-zinc-900 pt-4">
            <button
              onClick={() => setActiveView("logs")}
              className={`flex items-center gap-4 px-2 py-2 transition-all ${activeView === "logs" ? "text-primary" : "text-zinc-600 hover:text-primary"}`}
            >
              <Terminal className="w-4 h-4 flex-shrink-0" />
              <span className="hidden md:inline text-[10px]">Logs</span>
            </button>
            <button className="flex items-center gap-4 px-2 py-2 text-zinc-600 hover:text-zinc-400 transition-all">
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span className="hidden md:inline text-[10px]">Settings</span>
            </button>
          </div>
        </aside>

        {/* ── Main Content Canvas ── */}
        <main className="flex-1 pl-20 md:pl-64 pr-4 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* VAULT */}
            {activeView === "vault" && (
              <motion.div key="vault" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="py-8 min-h-full">
                <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h1 className="text-4xl font-headline font-bold text-primary tracking-tight uppercase">Identity_Vault</h1>
                    <p className="text-on-surface-variant font-label text-xs mt-1 uppercase tracking-widest">Zero-Knowledge Asset Repository</p>
                  </div>
                  <div className="flex gap-3">
                    {isConnected && (
                      <div className="px-4 py-2 bg-surface-container-high border border-outline-variant/20 flex items-center gap-2">
                        <span className="w-2 h-2 bg-tertiary rounded-full animate-pulse" />
                        <span className="text-[10px] font-headline uppercase tracking-tighter text-on-surface-variant">Live Connection: Encrypted</span>
                      </div>
                    )}
                  </div>
                </header>
                <div className="grid grid-cols-12 gap-6">
                  <div className="col-span-12 lg:col-span-8">
                    <IdentityVault onClaimStealth={handleClaimStealth} />
                  </div>
                  <div className="col-span-12 lg:col-span-4">
                    <StealthInbox />
                  </div>
                </div>
              </motion.div>
            )}

            {/* THEATER */}
            {activeView === "theater" && (
              <motion.div key="theater" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="py-8">
                <header className="mb-8">
                  <h1 className="text-4xl font-headline font-bold text-primary tracking-tight uppercase">Action_Theater</h1>
                  <p className="text-on-surface-variant font-label text-xs mt-1 uppercase tracking-widest">MCP Action Execution Interface</p>
                </header>
                <ActionTheater />
              </motion.div>
            )}

            {/* MAP */}
            {activeView === "map" && (
              <motion.div key="map" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="py-8">
                <header className="mb-8">
                  <h1 className="text-4xl font-headline font-bold text-primary tracking-tight uppercase">Ghost_Map</h1>
                  <p className="text-on-surface-variant font-label text-xs mt-1 uppercase tracking-widest">Network Shard Topology</p>
                </header>
                <GhostMap />
              </motion.div>
            )}

            {/* LOGS */}
            {activeView === "logs" && (
              <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="h-[calc(100vh-8rem)] flex flex-col">
                <AIThoughtConsole fullscreen />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ── Fixed Footer Status Bar ── */}
      <footer className="fixed bottom-0 w-full h-8 z-50 flex items-center px-4 bg-zinc-950 border-t border-cyan-900/30 font-mono-tech text-[10px] uppercase justify-between">
        <div className="flex items-center gap-6">
          <span className="text-primary">VANISH_OS // STREAMING_INTEL</span>
          <div className="flex gap-4">
            <button onClick={() => setActiveView("logs")} className="text-zinc-700 hover:text-primary transition-colors">THOUGHT_LOG</button>
            <span className="text-zinc-700">ENCRYPTION_STATUS</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-primary" : "bg-zinc-600"}`} />
          {isConnected ? `CONNECTED_${shortAddress?.toUpperCase()}` : "NOT_CONNECTED"}
        </div>
      </footer>

      {/* ── Provisioning Overlay (Secret Handshake) — matches provitioning.html ── */}
      <AnimatePresence>
        {isProvisioning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-surface overflow-hidden"
          >
            {/* Background radial glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(138,235,255,0.05)_0%,_transparent_70%)]" />
            <div className="noise-overlay absolute inset-0" />

            {/* Secret Handshake Card */}
            <div className="glass-panel w-full max-w-2xl overflow-hidden shadow-2xl relative z-10">
              <div className="scanline" style={{ top: 0 }} />
              <div className="p-8 md:p-12 flex flex-col items-center text-center">

                {/* Brand */}
                <div className="mb-12">
                  <h1 className="font-headline text-3xl font-bold tracking-tighter text-primary uppercase">VANISH</h1>
                  <p className="font-label text-xs tracking-[0.3em] text-on-surface-variant mt-2">SECURE AGENT PROVISIONING</p>
                </div>

                {/* Progress Ring */}
                <div className="relative w-48 h-48 mb-12 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-primary/10 rounded-full" />
                  <div className="absolute inset-0 border-t-2 border-primary rounded-full animate-pulse-ring shadow-[0_0_15px_rgba(138,235,255,0.4)]" />
                  <div className="flex flex-col items-center gap-3">
                    <svg className="w-12 h-12 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                    <div className="flex flex-col gap-1 items-center">
                      <span className="w-1 h-1 bg-primary rounded-full animate-bounce" />
                      <span className="w-1 h-1 bg-primary/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1 h-1 bg-primary/30 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>

                {/* Steps list */}
                <div className="space-y-4 mb-12 w-full max-w-sm">
                  <h2 className="font-headline text-xl text-primary font-medium">The Secret Handshake</h2>
                  <div className="space-y-2 text-sm font-label uppercase tracking-widest text-on-surface-variant bg-surface-container-low/50 py-4 px-6 border border-outline-variant/10">
                    <div className="flex items-center gap-3 opacity-100">
                      <svg className="w-5 h-5 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" /></svg>
                      <span>Awaiting Wallet Signature...</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-40">
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /></svg>
                      <span>Deriving Local Privacy Keys...</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-40">
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2} /></svg>
                      <span>Agent Provisioned Successfully</span>
                    </div>
                  </div>
                </div>

                {/* Wallet Selection */}
                <div className="w-full">
                  <p className="font-label text-[10px] tracking-[0.2em] text-on-surface-variant mb-6">SELECT AUTHENTICATION PROVIDER</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={handleConnectMetaMask}
                      disabled={isConnecting !== null}
                      className="flex items-center justify-center gap-3 p-4 bg-surface-container-high hover:bg-surface-bright transition-all border border-outline-variant/20 hover:border-primary/50 group disabled:opacity-40"
                    >
                      <div className="w-6 h-6 bg-orange-500 rounded-sm flex items-center justify-center text-white text-xs font-bold">M</div>
                      <span className="font-headline font-semibold text-sm tracking-tight">METAMASK</span>
                    </button>
                    <button
                      onClick={handleConnectHashPack}
                      disabled={isConnecting !== null}
                      className="flex items-center justify-center gap-3 p-4 bg-surface-container-high hover:bg-surface-bright transition-all border border-outline-variant/20 hover:border-primary/50 group disabled:opacity-40"
                    >
                      <div className="w-6 h-6 bg-purple-500 rounded-sm flex items-center justify-center text-white text-xs font-bold">H</div>
                      <span className="font-headline font-semibold text-sm tracking-tight">HASHPACK</span>
                    </button>
                  </div>
                  <button className="mt-4 w-full py-2 text-[10px] font-label tracking-[0.2em] text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    HARDWARE WALLET / LEDGER
                  </button>
                </div>
              </div>
              <div className="scanline" style={{ bottom: 0 }} />
            </div>

            {/* Corner decorations */}
            <div className="absolute bottom-12 left-12 font-label text-[10px] text-primary/30 tracking-widest hidden md:block z-10">
              ESTABLISHING ENCRYPTED TUNNEL [0x42..FF]<br />
              LOCAL NODE STATUS: ACTIVE
            </div>
            <div className="absolute bottom-12 right-12 font-label text-[10px] text-primary/30 tracking-widest text-right hidden md:block z-10">
              PROTOCOL: SHAKE_V2.1<br />
              LATENCY: 14MS
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stealth Reveal Modal ── */}
      {showStealthReveal && selectedStealthTransfer && (
        <StealthReveal
          transfer={selectedStealthTransfer}
          onClose={() => setShowStealthReveal(false)}
        />
      )}

      {/* ── Confirmation Modal ── */}
      <ConfirmationModal />
    </div>
  );
}
