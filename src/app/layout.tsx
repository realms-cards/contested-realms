import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fantaisieArtistique = localFont({
  src: "../../public/fantaisie_artistiqu.ttf",
  variable: "--font-fantaisie",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Contested Realms",
  description: "Play Sorcery: Contested Realm online and offline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fantaisieArtistique.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
