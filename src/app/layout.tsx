import type { Metadata } from "next";
import { Geist, Geist_Mono, Special_Elite } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { IdentityBoot } from "@/components/auth/IdentityBoot";
import { ConsentNotice } from "@/components/auth/ConsentNotice";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";
import "@/components/play/play.css";

const grotesk = Geist({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const typewriter = Special_Elite({
  variable: "--font-typewriter-src",
  weight: "400",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Draw & Order",
    template: "%s · Draw & Order",
  },
  description:
    "Meet the witnesses. Sketch the suspect. Solve an odd little crime. A playful drawing game for wonderfully imperfect artists.",
  openGraph: {
    siteName: "Draw & Order",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${grotesk.variable} ${typewriter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <ConsentNotice />
        <IdentityBoot />
        <Analytics />
      </body>
    </html>
  );
}