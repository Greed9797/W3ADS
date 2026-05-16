import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";

import { CookieBanner } from "@/components/compliance/cookie-banner";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adstart W3",
  description: "Dashboard unificado de marketing analytics para e-commerce.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${fraunces.variable} ${geist.variable} ${jetBrainsMono.variable}`}>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
