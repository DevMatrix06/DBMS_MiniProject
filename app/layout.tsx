import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DevMatch",
  description: "Semantic matching of open-source issues to contributor skills",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {/* Nav reads the session cookie, so it streams in at request time. */}
        <Suspense fallback={<header className="nav"><div className="nav-inner"><span className="brand">DevMatch</span></div></header>}>
          <Nav />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
