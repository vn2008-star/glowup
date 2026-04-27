import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlowUp — AI-Powered Beauty Business Automation",
  description:
    "The all-in-one platform that helps salons, spas, barbershops, lash bars, med spas, and wellness studios grow on autopilot. Smart booking, client CRM, retention automation, and social media tools.",
  keywords:
    "salon software, nail salon booking, beauty business automation, salon CRM, lash appointment, hair salon management",
  openGraph: {
    title: "GlowUp — Grow Your Beauty Business on Autopilot",
    description:
      "Smart booking, AI-powered CRM, retention automation, and social media tools for salons, spas, barbershops, lash bars, med spas, and wellness studios.",
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
