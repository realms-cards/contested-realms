import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [new URL("https://cdn.discordapp.com/avatars/**")],
  },
};

export default nextConfig;
