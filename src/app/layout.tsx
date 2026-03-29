import type { Metadata, Viewport } from "next";
// Google fonts disabled for offline/CI builds
import localFont from "next/font/local";
import "./globals.css";
import { getServerSession } from "next-auth/next";
import AuthProvider from "@/components/auth/AuthProvider";
import GlobalUserBadge from "@/components/auth/GlobalUserBadge";
import GlobalNetworkLoadingBridge from "@/components/providers/GlobalNetworkLoadingBridge";
import OnlineProvider from "@/components/providers/OnlineProvider";
import PreventBrowserZoom from "@/components/providers/PreventBrowserZoom";
import TournamentInviteListener from "@/components/tournament/TournamentInviteListener";
import TournamentMatchPrompt from "@/components/tournament/TournamentMatchPrompt";
import ThemeScope from "@/components/ui/ThemeScope";
import { CacheProvider } from "@/contexts/CacheContext";
import { RealtimeTournamentProvider } from "@/contexts/RealtimeTournamentContext";
import { authOptions } from "@/lib/auth";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { LoadingProvider } from "@/lib/contexts/LoadingContext";
import { SoundProvider } from "@/lib/contexts/SoundContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import { VideoOverlayProvider } from "@/lib/contexts/VideoOverlayContext";

// Provide empty variables instead of loading Google fonts in network-restricted environments
const geistSans = { variable: "" } as { variable: string };
const geistMono = { variable: "" } as { variable: string };

const fantaisieArtistique = localFont({
  src: "../../public/fantaisie_artistiqu.ttf",
  variable: "--font-fantaisie",
  display: "swap",
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://realms.cards";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Realms.cards — Play Sorcery: Contested Realms Online",
    template: "%s | Realms.cards",
  },
  description:
    "Free community simulator for Sorcery: Contested Realms. Play online, draft, build decks, manage your collection, and compete in tournaments.",
  keywords: [
    "Sorcery",
    "Contested Realms",
    "TCG",
    "card game",
    "online",
    "simulator",
    "draft",
    "deck builder",
    "tournament",
  ],
  authors: [{ name: "Realms.cards Community" }],
  creator: "Realms.cards",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "Realms.cards",
    title: "Realms.cards — Play Sorcery: Contested Realms Online",
    description:
      "Free community simulator for Sorcery: Contested Realms. Play online, draft, build decks, and compete in tournaments.",
    images: [
      {
        url: "/screenshots/wide-1280x720.png",
        width: 1280,
        height: 720,
        alt: "Realms.cards — Sorcery: Contested Realms online simulator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Realms.cards — Play Sorcery: Contested Realms Online",
    description:
      "Free community simulator for Sorcery: Contested Realms. Play online, draft, build decks, and compete in tournaments.",
    images: ["/screenshots/wide-1280x720.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "Realms.cards",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  viewportFit: "cover",
  themeColor: "#111111",
  // Prevent browser zoom from pinch gestures on mobile/touch devices
  userScalable: false,
  maximumScale: 1,
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch the initial session on the server to avoid a client-only loading state
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fantaisieArtistique.variable} antialiased`}
        suppressHydrationWarning
      >
        <LoadingProvider>
          <GlobalNetworkLoadingBridge />
          <PreventBrowserZoom />
          <ThemeProvider defaultMode="colorful">
            <ColorBlindProvider>
              <SoundProvider>
                <AuthProvider session={session}>
                  <CacheProvider>
                    <ThemeScope>
                      <OnlineProvider>
                        <RealtimeTournamentProvider>
                          <VideoOverlayProvider>
                            {children}
                            <TournamentInviteListener />
                            <TournamentMatchPrompt />
                          </VideoOverlayProvider>
                        </RealtimeTournamentProvider>
                      </OnlineProvider>
                    </ThemeScope>
                    {/* Floating user badge on all non-online pages */}
                    <GlobalUserBadge />
                    {/* Theme toggle removed per design: muted colorful is the standard */}
                  </CacheProvider>
                </AuthProvider>
              </SoundProvider>
            </ColorBlindProvider>
          </ThemeProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}
