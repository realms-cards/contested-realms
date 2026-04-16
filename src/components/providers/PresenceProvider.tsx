"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useOnline } from "@/app/online/online-context";
import InviteToast from "@/components/online/InviteToast";
import { buildLobbyInvitePath } from "@/lib/lobby-links";
import type { LobbyInvitePayloadT, PlayerLocation } from "@/lib/net/protocol";
import { notifyLobbyInvite } from "@/lib/notifications/browserNotifications";

interface PresenceContextValue {
  connected: boolean;
  location: PlayerLocation;
  setLocation: (location: PlayerLocation) => void;
  invites: LobbyInvitePayloadT[];
  dismissInvite: (lobbyId: string) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    // Return a no-op context if not wrapped
    return {
      connected: false,
      location: "offline" as PlayerLocation,
      setLocation: () => {},
      invites: [],
      dismissInvite: () => {},
    };
  }
  return ctx;
}

interface PresenceProviderProps {
  children: React.ReactNode;
  /** Initial location for this page */
  location: PlayerLocation;
}

/**
 * Lightweight presence provider for non-lobby pages (collection, decks, etc.)
 * Uses the existing OnlineProvider's transport instead of creating a new socket.
 * This eliminates duplicate socket connections.
 */
export function PresenceProvider({
  children,
  location: initialLocation,
}: PresenceProviderProps) {
  const router = useRouter();
  // Use the existing transport from OnlineProvider (in root layout)
  const {
    transport,
    connected: onlineConnected,
    invites: onlineInvites,
  } = useOnline();

  const [location, setLocationState] =
    useState<PlayerLocation>(initialLocation);
  const [localInvites, setLocalInvites] = useState<LobbyInvitePayloadT[]>([]);

  // Merge invites from OnlineProvider with any local state
  const invites = onlineInvites.length > 0 ? onlineInvites : localInvites;
  const connected = onlineConnected;

  // Set initial location when transport becomes available
  useEffect(() => {
    if (transport && connected) {
      transport.setLocation?.(initialLocation);
    }
  }, [transport, connected, initialLocation]);

  // Listen for invites on the shared transport
  useEffect(() => {
    if (!transport) return;

    const unsubInvite = transport.on("lobbyInvite", (invite) => {
      console.log("[Presence] Received invite from", invite.from.displayName);
      // Show browser notification if tab is not focused
      notifyLobbyInvite(invite.from.displayName, invite.lobbyId);
      setLocalInvites((prev) => {
        const key = `${invite.lobbyId}:${invite.from.id}`;
        const exists = prev.some(
          (inv) => `${inv.lobbyId}:${inv.from.id}` === key,
        );
        if (exists) return prev;
        return [...prev, invite];
      });
    });

    return () => {
      unsubInvite();
    };
  }, [transport]);

  // Update location when it changes
  const setLocation = useCallback(
    (newLocation: PlayerLocation) => {
      setLocationState(newLocation);
      if (transport && connected) {
        transport.setLocation?.(newLocation);
      }
    },
    [transport, connected],
  );

  const dismissInvite = useCallback((lobbyId: string) => {
    setLocalInvites((prev) => prev.filter((inv) => inv.lobbyId !== lobbyId));
  }, []);

  const handleAcceptInvite = useCallback(
    (invite: LobbyInvitePayloadT) => {
      dismissInvite(invite.lobbyId);
      router.push(buildLobbyInvitePath(invite.lobbyId));
    },
    [dismissInvite, router],
  );

  const handleDeclineInvite = useCallback(
    (invite: LobbyInvitePayloadT) => {
      if (transport) {
        transport.respondToInvite?.(invite.lobbyId, "declined");
      }
      dismissInvite(invite.lobbyId);
    },
    [transport, dismissInvite],
  );

  const handlePostponeInvite = useCallback(
    (invite: LobbyInvitePayloadT) => {
      if (transport) {
        transport.respondToInvite?.(invite.lobbyId, "postponed");
      }
      dismissInvite(invite.lobbyId);
    },
    [transport, dismissInvite],
  );

  const value: PresenceContextValue = {
    connected,
    location,
    setLocation,
    invites,
    dismissInvite,
  };

  return (
    <PresenceContext.Provider value={value}>
      {children}

      {/* Render invite toasts */}
      {invites.map((invite) => (
        <InviteToast
          key={`${invite.lobbyId}:${invite.from.id}`}
          invite={invite}
          onAccept={() => handleAcceptInvite(invite)}
          onDecline={() => handleDeclineInvite(invite)}
          onPostpone={() => handlePostponeInvite(invite)}
          onDismiss={() => dismissInvite(invite.lobbyId)}
          autoHideMs={60000}
        />
      ))}
    </PresenceContext.Provider>
  );
}
