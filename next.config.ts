import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

// Bundle analyzer configuration (run with ANALYZE=true npm run build)
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone", // Required for Docker deployment
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        pathname: "/avatars/**",
      },
      { protocol: "https", hostname: "cdn.realms.cards", pathname: "/**" },
    ],
  },

  // Board assets in public/ are large and rarely change. Let browsers reuse
  // them for a week (revalidating in the background) instead of re-checking
  // every match. Development overrides these headers; the service worker
  // caches the same files there.
  async headers() {
    const boardAssetCache = [
      {
        key: "Cache-Control",
        value: "public, max-age=604800, stale-while-revalidate=2592000",
      },
    ];
    return [
      { source: "/3dmodels/:path*", headers: boardAssetCache },
      { source: "/hdri/:path*", headers: boardAssetCache },
      { source: "/ktx2/:path*", headers: boardAssetCache },
      { source: "/playmat.jpg", headers: boardAssetCache },
      { source: "/playmat-overlay.png", headers: boardAssetCache },
    ];
  },

  // Exclude Three.js and React Three Fiber packages from server-side bundling
  // This prevents @react-three/drei's Html component from being confused with next/document Html
  serverExternalPackages: [
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@react-three/rapier",
  ],

  // Performance optimizations
  experimental: {
    // Tree-shake large dependencies for smaller bundles
    // Note: three.js packages are in serverExternalPackages, so they're excluded here
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-virtual", // Virtual scrolling library
    ],
  },

  // Webpack optimizations for production bundles
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Split vendor chunks for better caching
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization?.splitChunks,
          cacheGroups: {
            ...config.optimization?.splitChunks?.cacheGroups,
            // Separate Three.js into its own chunk (large library ~600KB)
            three: {
              test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/,
              name: "three",
              chunks: "all",
              priority: 10,
            },
            // Separate React into its own chunk for better caching
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              name: "react",
              chunks: "all",
              priority: 20,
            },
          },
        },
      };
    }
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
