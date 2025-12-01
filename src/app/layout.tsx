import type { Metadata, Viewport } from "next";
// Google fonts disabled for offline/CI builds
import localFont from "next/font/local";
import "./globals.css";
import { getServerSession } from "next-auth/next";
import AuthProvider from "@/components/auth/AuthProvider";
import GlobalUserBadge from "@/components/auth/GlobalUserBadge";
import GlobalNetworkLoadingBridge from "@/components/providers/GlobalNetworkLoadingBridge";
import OnlineProvider from "@/components/providers/OnlineProvider";
import ThemeScope from "@/components/ui/ThemeScope";
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

export const metadata: Metadata = {
  title: "Realms.cards",
  description: "",
  manifest: "/manifest.webmanifest",
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
  viewportFit: "cover",
  themeColor: "#111111",
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
          <ThemeProvider defaultMode="colorful">
            <ColorBlindProvider>
              <SoundProvider>
                <AuthProvider session={session}>
                  <ThemeScope>
                    <OnlineProvider>
                      <RealtimeTournamentProvider>
                        <VideoOverlayProvider>{children}</VideoOverlayProvider>
                      </RealtimeTournamentProvider>
                    </OnlineProvider>
                  </ThemeScope>
                  {/* Floating user badge on all non-online pages */}
                  <GlobalUserBadge />
                  {/* Theme toggle removed per design: muted colorful is the standard */}
                </AuthProvider>
              </SoundProvider>
            </ColorBlindProvider>
          </ThemeProvider>
        </LoadingProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
