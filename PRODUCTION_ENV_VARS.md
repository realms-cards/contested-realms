# Required Production Environment Variables

## Critical for Cube Draft (300+ cards)

These environment variables **MUST** be set in your production environment (Vercel/deployment platform) to prevent WebGL context loss during cube drafts:

```bash
# Texture cache settings - critical for cube drafts with 300+ unique cards
NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=400
NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS=45000
```

### Why These Are Required

**Cube drafts** can have 300+ unique cards, each requiring a separate WebGL texture. Without these settings:
- Default cache size is only 150 textures
- GPU runs out of memory with 300+ textures loaded
- WebGL context is lost repeatedly
- Cards become greyed out and unresponsive

### Deployment Checklist

- [ ] Add `NEXT_PUBLIC_TEXTURE_CACHE_MAX_SIZE=400` to Vercel environment variables
- [ ] Add `NEXT_PUBLIC_TEXTURE_CACHE_TTL_MS=45000` to Vercel environment variables
- [ ] Redeploy after setting environment variables
- [ ] Test cube draft with 8 players to verify no context loss

### Alternative: Reduce Cube Size

If you cannot increase texture cache limits, reduce cube size to <150 unique cards.
