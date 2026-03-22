"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function ShinyText({ children, className, disabled = false }: ShinyTextProps) {
  if (disabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <motion.span
      className={cn(
        "bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 via-white to-zinc-400 font-medium inline-block relative",
        className
      )}
      style={{
        backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 50%, rgba(255,255,255,0) 100%)",
        backgroundSize: "200% auto",
      }}
      animate={{
        backgroundPosition: ["200% center", "-200% center"],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "linear",
      }}
    >
      <span className="absolute inset-0 bg-clip-text text-transparent bg-gradient-to-r from-zinc-400 via-zinc-100 to-zinc-400 mix-blend-overlay">
        {children}
      </span>
      {children}
    </motion.span>
  );
}
