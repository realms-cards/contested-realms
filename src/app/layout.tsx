import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
// Google fonts disabled for offline/CI builds
import localFont from "next/font/local";
import "./globals.css";
import { getServerSession } from "next-auth/next";
import AuthProvider from "@/components/auth/AuthProvider";
import ThemeScope from "@/components/ui/ThemeScope";
import { authOptions } from "@/lib/auth";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import { VideoOverlayProvider } from "@/lib/contexts/VideoOverlayContext";
import ConsoleWarningFilter from "@/components/dev/ConsoleWarningFilter";

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
        {/* Dev-only: filter noisy troika/opentype warnings in the browser console */}
        {process.env.NODE_ENV !== 'production' ? <ConsoleWarningFilter /> : null}
        <ThemeProvider defaultMode="colorful">
          <AuthProvider session={session}>
            <ThemeScope>
              <VideoOverlayProvider>{children}</VideoOverlayProvider>
            </ThemeScope>
            {/* Theme toggle removed per design: muted colorful is the standard */}
          </AuthProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
