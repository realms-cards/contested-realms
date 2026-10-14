/**
 * Tracks whether a `UserBadge` placed by a page or shell is already on screen.
 *
 * The floating `GlobalUserBadge` lives in the root layout, a sibling of the
 * page tree, so it cannot read this from React context. A tiny external store
 * lets it stand down whenever the page already shows a badge - the AppShell
 * nav, the match HUD, the draft screens, the 3D deck editor - instead of
 * maintaining a route list that drifts every time a screen adds or drops one.
 *
 * Deliberately has no "use client" directive: it is a plain module, and the
 * directive makes each importing client boundary get its own copy of the
 * module state, which silently breaks the hand-off.
 */
let badgeCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Called by every UserBadge except the global floating one. */
export function registerUserBadge(): () => void {
  badgeCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    badgeCount -= 1;
    emit();
  };
}

/**
 * For a full-screen surface that has no room for the floating badge in its corner and offers
 * the account controls somewhere of its own (the 2D engine board's More sheet). It stands the
 * global badge down exactly as a mounted badge does; call the returned function on unmount.
 */
export function suppressGlobalUserBadge(): () => void {
  return registerUserBadge();
}

export function subscribeToUserBadges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUserBadgeSnapshot(): boolean {
  return badgeCount > 0;
}

/** Nothing has mounted during SSR, so the global badge renders by default. */
export function getUserBadgeServerSnapshot(): boolean {
  return false;
}
