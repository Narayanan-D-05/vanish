"use client";

import { motion } from "framer-motion";
import { useWallet } from "@/contexts/WalletProvider";
import { useState } from "react";

export function LandingPage() {
  const { connectMetaMask, connectHashPack } = useWallet();
  const [connecting, setConnecting] = useState<"metamask" | "hashpack" | null>(null);

  const handleConnect = async (type: "metamask" | "hashpack") => {
    setConnecting(type);
    try {
      if (type === "metamask") await connectMetaMask();
      else await connectHashPack();
    } catch (e) {
      console.error(e);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div style={{ backgroundColor: "#131315", color: "#e5e1e4" }} className="min-h-screen font-body">

      {/* ── Top Nav Bar ── */}
      <nav className="fixed top-0 w-full flex justify-between items-center px-8 py-4 z-50 border-b" style={{ backgroundColor: "rgba(19,19,21,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(60,73,76,0.2)", boxShadow: "0 20px 40px rgba(0,106,255,0.12)" }}>
        <div className="text-2xl font-black tracking-tighter font-headline uppercase" style={{ color: "#22d3ee" }}>VANISH</div>
        <div className="hidden md:flex items-center gap-8">
          {["Vault", "Network", "Documentation", "Pitch Deck"].map(link => (
            <a key={link} href="#" className="font-headline font-bold tracking-tight uppercase text-sm transition-colors hover:text-cyan-400" style={{ color: "#bbc9cd" }}>
              {link}
            </a>
          ))}
        </div>
        <button
          onClick={() => handleConnect("metamask")}
          disabled={!!connecting}
          className="font-headline font-bold uppercase tracking-tight px-6 py-2 text-sm transition-all active:scale-95 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #8aebff, #22d3ee)", color: "#00363e" }}
        >
          {connecting ? "Connecting..." : "Provision Agent"}
        </button>
      </nav>

      <main className="pt-24">
        {/* ── Hero Section ── */}
        <section className="relative flex items-center justify-center px-8 overflow-hidden text-center" style={{ minHeight: "90vh" }}>
          {/* Background glows */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 800, height: 800, background: "radial-gradient(circle, rgba(138,235,255,0.06) 0%, transparent 70%)", borderRadius: "50%" }} />
            <div className="absolute top-0 right-0" style={{ width: 400, height: 400, background: "radial-gradient(circle, rgba(91,244,222,0.05) 0%, transparent 70%)", borderRadius: "50%" }} />
          </div>

          <div className="relative max-w-5xl mx-auto w-full">
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 border" style={{ backgroundColor: "rgba(42,42,44,0.8)", borderColor: "rgba(60,73,76,0.3)" }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#8aebff" }} />
              <span className="font-label text-xs tracking-widest uppercase" style={{ color: "#bbc9cd" }}>Network Status: Secured by ZK-Proof</span>
            </div>

            {/* Hero headline */}
            <h1 className="font-headline font-black leading-none tracking-tighter mb-8" style={{ fontSize: "clamp(3rem, 8vw, 7rem)", color: "#e5e1e4" }}>
              VANISH:{" "}
              <span style={{ background: "linear-gradient(90deg, #8aebff, #22d3ee, #5bf4de)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                The Agentic Privacy Pool
              </span>
            </h1>

            {/* Sub */}
            <p className="max-w-2xl mx-auto font-light leading-relaxed mb-12" style={{ color: "#bbc9cd", fontSize: "1.2rem" }}>
              Autonomous, Zero-Knowledge dark pool and privacy concierge for the Hedera Network.
              Sentient machine-to-machine privacy for the Agentic Economy.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => handleConnect("metamask")}
                disabled={!!connecting}
                className="w-full sm:w-auto font-headline font-bold uppercase tracking-tighter transition-all active:scale-95 disabled:opacity-50"
                style={{ padding: "1rem 2.5rem", backgroundColor: "#8aebff", color: "#00363e", fontSize: "1.125rem", boxShadow: connecting === "metamask" ? "0 0 30px rgba(138,235,255,0.4)" : undefined }}
              >
                {connecting === "metamask" ? "Connecting..." : "Provision Agent"}
              </button>
              <button
                className="w-full sm:w-auto font-headline font-bold uppercase tracking-tighter transition-all"
                style={{ padding: "1rem 2.5rem", border: "1px solid rgba(60,73,76,0.4)", color: "#e5e1e4", fontSize: "1.125rem" }}
              >
                View Blueprint
              </button>
            </div>
          </div>
        </section>

        {/* ── Elevator Pitch ── */}
        <section className="py-24 px-8" style={{ backgroundColor: "#1c1b1d" }}>
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-7">
              <h2 className="font-headline text-4xl font-bold mb-8" style={{ color: "#e5e1e4" }}>
                Invisible Infrastructure for <br />Institutional Logic
              </h2>
              <p className="text-lg leading-relaxed mb-6" style={{ color: "#bbc9cd" }}>
                In the agentic economy, transparency is a vulnerability. VANISH acts as an HOL-registered broker that abstracts transaction intent from public visibility.
              </p>
              <p className="text-lg leading-relaxed" style={{ color: "#bbc9cd" }}>
                By leveraging decentralized sequencers and Hedera Consensus Service, we protect strategies, treasuries, and supply chains from predatory front-running and chain-analysis.
              </p>
            </div>
            <div className="md:col-span-5">
              <div className="p-8 border-l-4" style={{ background: "rgba(42,42,44,0.6)", backdropFilter: "blur(12px)", borderColor: "#8aebff" }}>
                <div className="font-label text-xs mb-4 tracking-widest uppercase" style={{ color: "#8aebff" }}>System Logs</div>
                <div className="font-mono-tech text-sm space-y-2" style={{ color: "#bbc9cd" }}>
                  <p style={{ color: "#5bf4de" }}>&gt; Initializing HOL-Broker protocol...</p>
                  <p>&gt; Mapping treasury route (HCS-10)...</p>
                  <p>&gt; Obfuscating supply chain fragment [0x...4F2]</p>
                  <p style={{ color: "#8aebff" }}>
                    &gt; Status: SHIELDED{" "}
                    <span className="inline-block w-[0.2rem] h-[1.2rem] align-middle cursor-blink" style={{ backgroundColor: "#8aebff" }} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Dual-Agent Architecture ── */}
        <section className="py-24 px-8" style={{ backgroundColor: "#131315" }}>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-headline text-4xl font-bold uppercase tracking-tighter mb-4">Dual-Agent Architecture</h2>
              <div className="h-1 w-24 mx-auto" style={{ backgroundColor: "#8aebff" }} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1">
              {/* User Agent */}
              <div className="p-12 relative overflow-hidden" style={{ backgroundColor: "#2a2a2c" }}>
                <div className="absolute top-0 right-0 p-8 text-5xl opacity-20 select-none">🛡</div>
                <h3 className="font-headline text-2xl font-bold mb-6" style={{ color: "#8aebff" }}>
                  The User Agent<br />
                  <span className="text-sm font-medium uppercase tracking-widest" style={{ color: "#bbc9cd" }}>(Privacy Concierge)</span>
                </h3>
                <ul className="space-y-4">
                  {[
                    ["⚙️", "Local, client-side AI powered by LangChain and Ollama for total sovereign compute."],
                    ["🔐", "Parses natural language requests into complex ZK-proof logic autonomously."],
                    ["🔑", "Manages the local Vault and generates transaction fragments without exposing keys."],
                  ].map(([icon, text], i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">{icon}</span>
                      <span style={{ color: "#bbc9cd" }}>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pool Manager */}
              <div className="p-12 relative overflow-hidden" style={{ backgroundColor: "#353437" }}>
                <div className="absolute top-0 right-0 p-8 text-5xl opacity-20 select-none">⬡</div>
                <h3 className="font-headline text-2xl font-bold mb-6" style={{ color: "#5bf4de" }}>
                  The Pool Manager<br />
                  <span className="text-sm font-medium uppercase tracking-widest" style={{ color: "#bbc9cd" }}>(Infrastructure)</span>
                </h3>
                <ul className="space-y-4">
                  {[
                    ["☁️", "Decentralized cloud-based verification layer ensuring mathematical integrity."],
                    ["∑", "Verifies ZK-math and enforces UAID (User Agent Identity) without data leakage."],
                    ["⛓", "Batches transactions for extreme HCS efficiency and anonymized dispersal."],
                  ].map(([icon, text], i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0" style={{ color: "#5bf4de" }}>{icon}</span>
                      <span style={{ color: "#bbc9cd" }}>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Core Capabilities Bento ── */}
        <section className="py-24 px-8" style={{ backgroundColor: "#131315" }}>
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
              <div>
                <h2 className="font-headline text-4xl font-bold mb-2">Core Capabilities</h2>
                <p className="font-label uppercase tracking-widest text-xs" style={{ color: "#bbc9cd" }}>
                  Model Context Protocol (MCP) Specialized Skills
                </p>
              </div>
              <span className="font-mono-tech text-sm" style={{ color: "#8aebff" }}>active_modules: 04/04</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                ["🛡", "Shield", "Autonomous HBAR fragmentation and ZK-commitments to mask asset entry."],
                ["⇄", "Internal Transfer", "100% invisible B2B dark commerce within the pool perimeter."],
                ["○", "Stealth Sweeps", "One-time public addresses via homomorphic key derivation."],
                ["🔒", "Safe-Withdraw", "Randomized delays and amount splitting to break deterministic analysis."],
              ].map(([icon, title, desc], i) => (
                <div
                  key={i}
                  className="p-8 transition-all duration-300 cursor-pointer group"
                  style={{ backgroundColor: "#2a2a2c", borderBottom: "2px solid transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.borderBottomColor = "#8aebff")}
                  onMouseLeave={e => (e.currentTarget.style.borderBottomColor = "transparent")}
                >
                  <div className="text-3xl mb-6" style={{ color: "#8aebff" }}>{icon}</div>
                  <h4 className="font-headline text-xl font-bold mb-3">{title}</h4>
                  <p className="text-sm leading-relaxed" style={{ color: "#bbc9cd" }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tech Stack ── */}
        <section className="py-16 px-8" style={{ backgroundColor: "#1c1b1d" }}>
          <div className="max-w-7xl mx-auto flex flex-wrap justify-center items-center gap-12 opacity-40 hover:opacity-100 transition-all duration-500">
            {[
              ["HEDERA", "HCS-10 / HIP-1340"],
              ["SOLIDITY", ""],
              ["CIRCOM / SNARKJS", ""],
              ["LANGCHAIN", ""],
              ["OLLAMA", ""],
              ["MCP", ""],
              ["NEXT.JS", ""],
            ].map(([name, sub], i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="font-headline font-bold text-xl">{name}</span>
                {sub && <span className="font-mono-tech text-[10px] tracking-widest" style={{ color: "#8aebff" }}>{sub}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-32 px-8 relative overflow-hidden" style={{ backgroundColor: "#131315" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(138,235,255,0.03)" }} />
          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="font-headline font-black uppercase tracking-tighter mb-6" style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)" }}>
              Ready to Vanish?
            </h2>
            <p className="text-xl mb-12" style={{ color: "#bbc9cd" }}>
              Join the ranks of secure agentic commerce. Provision your concierge today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => handleConnect("metamask")}
                disabled={!!connecting}
                className="font-headline font-bold uppercase tracking-tighter transition-all hover:scale-105 duration-300 disabled:opacity-50"
                style={{ padding: "1.25rem 3rem", background: "linear-gradient(90deg, #8aebff, #22d3ee)", color: "#00363e", fontSize: "1.5rem" }}
              >
                {connecting === "metamask" ? "Connecting..." : "MetaMask"}
              </button>
              <button
                onClick={() => handleConnect("hashpack")}
                disabled={!!connecting}
                className="font-headline font-bold uppercase tracking-tighter transition-all disabled:opacity-50"
                style={{ padding: "1.25rem 3rem", border: "1px solid rgba(60,73,76,0.4)", color: "#e5e1e4", fontSize: "1.5rem" }}
              >
                {connecting === "hashpack" ? "Connecting..." : "HashPack"}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full py-12 px-8 flex flex-col md:flex-row justify-between items-center gap-6 border-t" style={{ backgroundColor: "#131315", borderColor: "rgba(60,73,76,0.15)" }}>
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="font-headline font-bold uppercase tracking-tight text-lg" style={{ color: "#22d3ee" }}>VANISH</div>
          <div className="font-body text-[10px] uppercase tracking-[0.2em] font-medium" style={{ color: "#bbc9cd" }}>
            © 2024 VANISH. SECURED BY HEDERA ZK-PROOF ARCHITECTURE.
          </div>
        </div>
        <div className="flex gap-8">
          {["Privacy Protocol", "Security Audit", "Terms of Provisioning", "Node Status"].map(link => (
            <a key={link} href="#" className="font-body text-[10px] uppercase tracking-[0.2em] font-medium underline transition-all hover:text-cyan-400" style={{ color: "#bbc9cd", textDecorationColor: "rgba(34,211,238,0.3)" }}>
              {link}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
