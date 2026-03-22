"use client";

import { motion } from "framer-motion";

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 min-h-screen overflow-hidden -z-50 pointer-events-none bg-[#0a0a0a]">
      {/* Aurora glow 1 */}
      <motion.div
        animate={{
          x: [0, 40, 0, -40, 0],
          y: [0, -30, 0, 30, 0],
          scale: [1, 1.2, 1, 1.1, 1],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vh] rounded-full bg-emerald-500/10 blur-[120px]"
      />
      {/* Aurora glow 2 */}
      <motion.div
        animate={{
          x: [0, -50, 0, 50, 0],
          y: [0, 40, 0, -40, 0],
          scale: [1, 1.1, 1, 1.2, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vh] rounded-full bg-cyan-500/10 blur-[150px]"
      />
      {/* Deep accent glow */}
      <motion.div
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.5, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[30%] left-[40%] w-[30vw] h-[30vh] rounded-full bg-violet-500/10 blur-[100px]"
      />
      
      {/* High-end grain overlay for texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', zIndex: 0 }} />
      
      {/* Subtle grid pattern for technical feel */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pt-4" />
    </div>
  );
}
