import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
