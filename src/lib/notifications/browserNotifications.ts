"use client";

/**
 * Browser Notifications utility for match invites and lobby events.
 * Notifications only fire when the document is hidden (tab not in focus).
 */

const NOTIFICATION_ICON = "/icons/icon-192.png";

export type NotificationPermissionState = "granted" | "denied" | "default";

/**
 * Check if browser notifications are supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Get current notification permission state
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/**
 * Request notification permission from the user
 * @returns The permission state after the request
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return "denied";

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

/**
 * Check if the document is currently hidden (tab not in focus)
 */
export function isDocumentHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden;
}

/**
 * Check if the window/document is not focused (user might not be looking)
 */
export function isWindowUnfocused(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden || !document.hasFocus();
}

/**
 * Show a browser notification if permission is granted.
 * By default, shows regardless of focus state (user may be on different page).
 * Set `onlyWhenHidden` to true to only notify when tab is hidden.
 * @returns true if notification was shown, false otherwise
 */
export function showNotification(
  title: string,
  options?: {
    body?: string;
    tag?: string;
    requireInteraction?: boolean;
    onClick?: () => void;
    onlyWhenHidden?: boolean;
  }
): boolean {
  if (!isNotificationSupported()) {
    console.log("[Notification] Not supported in this browser");
    return false;
  }
  if (Notification.permission !== "granted") {
    console.log(
      "[Notification] Permission not granted:",
      Notification.permission
    );
    return false;
  }
  // Only skip if explicitly requested AND document is focused
  if (options?.onlyWhenHidden && !isDocumentHidden()) return false;

  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: NOTIFICATION_ICON,
      tag: options?.tag, // Prevents duplicate notifications with same tag
      requireInteraction: options?.requireInteraction ?? false,
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        notification.close();
        options.onClick?.();
      };
    } else {
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }

    // Auto-close after 10 seconds if not interacted with
    setTimeout(() => {
      notification.close();
    }, 10000);

    return true;
  } catch {
    return false;
  }
}

/**
 * Show notification for a lobby invite
 */
export function notifyLobbyInvite(fromName: string, lobbyId: string): boolean {
  return showNotification(`Match Invite from ${fromName}`, {
    body: "You've been invited to join a match",
    tag: `lobby-invite-${lobbyId}`,
    requireInteraction: true,
  });
}

/**
 * Show notification when someone joins your lobby
 */
export function notifyPlayerJoinedLobby(
  playerName: string,
  lobbyName?: string
): boolean {
  return showNotification(`${playerName} joined your lobby`, {
    body: lobbyName ? `Lobby: ${lobbyName}` : "A player is ready to play",
    tag: `lobby-join-${Date.now()}`,
  });
}

/**
 * Show notification for a tournament invite
 */
export function notifyTournamentInvite(
  fromName: string,
  tournamentName: string,
  tournamentId: string
): boolean {
  return showNotification(`Tournament Invite from ${fromName}`, {
    body: `You've been invited to join ${tournamentName}`,
    tag: `tournament-invite-${tournamentId}`,
    requireInteraction: true,
  });
}
