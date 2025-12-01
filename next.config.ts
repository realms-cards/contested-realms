import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com", pathname: "/avatars/**" },
      { protocol: "https", hostname: "cdn.realms.cards", pathname: "/**" },
    ],
  },

  // Exclude Three.js and React Three Fiber packages from server-side bundling
  // This prevents @react-three/drei's Html component from being confused with next/document Html
  serverExternalPackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/rapier',
  ],

  // Performance optimizations
  experimental: {
    // Tree-shake large dependencies for smaller bundles
    // Note: three.js packages are in serverExternalPackages, so they're excluded here
    optimizePackageImports: [
      'lucide-react',
    ],
  },
};

export default nextConfig;
