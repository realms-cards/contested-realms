import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://realms.cards";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/tutorial",
          "/leaderboard",
          "/tournaments",
          "/random-spell",
          "/privacy",
          "/terms",
        ],
        disallow: [
          "/api/",
          "/admin/",
          "/online/",
          "/play/",
          "/draft/",
          "/draft-3d/",
          "/sealed/",
          "/booster/",
          "/collection/",
          "/decks/",
          "/cubes/",
          "/settings/",
          "/replay/",
          "/editor-3d/",
          "/meta/",
          "/discord/",
          "/lock/",
          "/_lockdown/",
          "/_diag/",
          "/auth/confirm",
          "/auth/error",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
