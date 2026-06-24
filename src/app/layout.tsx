import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "LifeController — your single source of truth",
  description:
    "Store everything you care about — houses, vehicles, gear, travel — with files, receipts and an AI agent that finds answers in your library.",
  manifest: "/manifest.json",
  applicationName: "LifeController",
  appleWebApp: { capable: true, title: "LifeController", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
