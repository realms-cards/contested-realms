-- Seed: Sorcerers Summit league
INSERT INTO "public"."League" ("id", "slug", "name", "discordGuildId", "apiEndpoint", "apiKeyEnvVar", "enabled", "badgeColor", "createdAt", "updatedAt")
VALUES (
  'clg_sorcerers_summit',
  'sorcerers-summit',
  'Sorcerers Summit',
  '1319120227643949211',
  'https://sorcererssummit.com/api/report-external-match',
  'SORCERERS_SUMMIT_API_KEY',
  true,
  '#7c3aed',
  NOW(),
  NOW()
)
ON CONFLICT ("slug") DO NOTHING;
