"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import InviteToast from "@/components/online/InviteToast";
import type { LobbyInvitePayloadT, PlayerLocation } from "@/lib/net/protocol";
import { SocketTransport } from "@/lib/net/socketTransport";

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
 * Connects to the socket server to appear online and receive invites.
 */
export function PresenceProvider({
  children,
  location: initialLocation,
}: PresenceProviderProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const transportRef = useRef<SocketTransport | null>(null);

  const [connected, setConnected] = useState(false);
  const [location, setLocationState] =
    useState<PlayerLocation>(initialLocation);
  const [invites, setInvites] = useState<LobbyInvitePayloadT[]>([]);

  // Connect to socket when session is available
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const transport = new SocketTransport();
    transportRef.current = transport;

    // Setup event listeners
    const unsubWelcome = transport.on("welcome", () => {
      console.log("[Presence] Connected to server");
      setConnected(true);
      // Set initial location
      transport.setLocation?.(initialLocation);
    });

    const unsubInvite = transport.on("lobbyInvite", (invite) => {
      console.log("[Presence] Received invite from", invite.from.displayName);
      setInvites((prev) => {
        // De-dup by lobbyId + from.id
        const key = `${invite.lobbyId}:${invite.from.id}`;
        const exists = prev.some(
          (inv) => `${inv.lobbyId}:${inv.from.id}` === key
        );
        if (exists) return prev;
        return [...prev, invite];
      });
    });

    const unsubError = transport.on("error", (err) => {
      console.warn("[Presence] Socket error:", err.message);
    });

    // Connect
    const displayName =
      session.user.name || `Player ${session.user.id.slice(-4)}`;
    transport
      .connect({
        displayName,
        playerId: session.user.id,
      })
      .catch((err) => {
        console.warn("[Presence] Failed to connect:", err);
      });

    return () => {
      unsubWelcome();
      unsubInvite();
      unsubError();
      transport.disconnect();
      transportRef.current = null;
      setConnected(false);
    };
  }, [session?.user?.id, session?.user?.name, status, initialLocation]);

  // Update location when it changes
  const setLocation = useCallback(
    (newLocation: PlayerLocation) => {
      setLocationState(newLocation);
      if (transportRef.current && connected) {
        transportRef.current.setLocation?.(newLocation);
      }
    },
    [connected]
  );

  const dismissInvite = useCallback((lobbyId: string) => {
    setInvites((prev) => prev.filter((inv) => inv.lobbyId !== lobbyId));
  }, []);

  const handleAcceptInvite = useCallback(
    (invite: LobbyInvitePayloadT) => {
      dismissInvite(invite.lobbyId);
      // Navigate to the lobby
      router.push(`/online/lobby?join=${invite.lobbyId}`);
    },
    [dismissInvite, router]
  );

  const handleDeclineInvite = useCallback(
    (invite: LobbyInvitePayloadT) => {
      if (transportRef.current) {
        transportRef.current.respondToInvite?.(invite.lobbyId, "declined");
      }
      dismissInvite(invite.lobbyId);
    },
    [dismissInvite]
  );

  const handlePostponeInvite = useCallback(
    (invite: LobbyInvitePayloadT) => {
      if (transportRef.current) {
        transportRef.current.respondToInvite?.(invite.lobbyId, "postponed");
      }
      dismissInvite(invite.lobbyId);
    },
    [dismissInvite]
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
