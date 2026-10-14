import type { Metadata } from "next";
import { Inter, Outfit, Playfair_Display } from "next/font/google";
import "./globals.css";

// Self-hosted through next/font: no render-blocking cross-origin stylesheet,
// no FOUT, and 11 weights instead of the 24 the Google Fonts link pulled.
// Only Inter and Playfair ship Vietnamese glyphs (Outfit is Latin-only).
const inter = Inter({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-outfit", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin", "vietnamese"], weight: ["400", "600", "700"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap" });
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/Dialog";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

export const metadata: Metadata = {
  title: "GlowUp — AI-Powered Beauty Business Automation",
  description:
    "The all-in-one platform that helps salons, spas, barbershops, lash bars, med spas, and wellness studios grow on autopilot. Smart booking, Customer Relationship Management, retention automation, and our Fill My Openings campaign tool to keep every chair full.",
  keywords:
    "salon software, nail salon booking, beauty business automation, salon customer relationship management, lash appointment, hair salon management",
  openGraph: {
    title: "GlowUp — Grow Your Beauty Business on Autopilot",
    description:
      "Smart booking, AI-powered Customer Relationship Management, retention automation, and Fill My Openings campaign tool for salons, spas, barbershops, lash bars, med spas, and wellness studios.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${outfit.variable} ${playfair.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme before first paint. The provider used to set data-theme in an
            effect, so every page painted light and then flipped to dark. Saved
            choice first, otherwise dark (the default, regardless of OS). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t='dark';try{if(localStorage.getItem('glowup_theme')==='light')t='light'}catch(e){}document.documentElement.setAttribute('data-theme',t)})()`,
          }}
        />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0e0b14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GlowUp" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider><ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider></ThemeProvider>
        </NextIntlClientProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
