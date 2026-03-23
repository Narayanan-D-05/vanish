import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletProvider } from "@/contexts/WalletProvider";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"], 
  variable: "--font-mono" 
});

export const metadata: Metadata = {
  title: "Vanish Protocol - AI-Powered Privacy",
  description: "Zero-knowledge privacy pool with AI-driven fragmentation on Hedera",
  icons: {
    icon: "/v-logo.png?v=3",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", inter.variable, jetbrainsMono.variable)}>
      <body className={`${inter.className} antialiased bg-transparent text-zinc-100 min-h-screen relative`}>
        <AnimatedBackground />
        <WalletProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
