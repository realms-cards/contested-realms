// World-space origin positions for cards that are about to appear on the board.
// Populated by Board's store subscription (fires before React re-renders),
// consumed and cleared by PermanentStack's animEntry.refCb on mount.
export const pendingOrigins = new Map<string, { x: number; z: number }>();
