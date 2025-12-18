## Why

Custom playmats are a key Patron feature and a foundation for future cosmetic personalization. Players need a private way to upload artwork, align it to the game’s required playmat aspect/size, preview it with the official grid overlay, and then use it in matches.

## What Changes

- Add Patron-only custom playmat management.
- Provide an in-browser playmat editor:
  - Upload an image.
  - Pan/zoom to fit within the fixed export frame.
  - Preview with grid overlay on/off.
  - Export/save as a 2556×1663 PNG.
- Store up to 5 private playmats per user in Postgres.
- Add a playmat selector that includes:
  - Standard playmats (current and future).
  - User’s uploaded playmats.

## Impact

- Affected specs:
  - `patron-custom-playmats` (new)
- Affected code (expected):
  - `prisma/schema.prisma` (new model for playmats, user selected playmat)
  - New API routes under `src/app/api/users/me/playmats/*`
  - New Patron UI page under `src/app/settings/playmat/*` (or equivalent)
  - Board wiring via existing `playmatUrl` state and `BoardEnvironment` texture loading

## Non-Goals

- Public sharing/marketplace for playmats.
- Client-side modding / arbitrary aspect ratios.
- Video/animated playmats.
