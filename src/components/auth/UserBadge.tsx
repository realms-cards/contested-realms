"use client";

import { Settings, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut, signIn } from "next-auth/react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { OnlineContext } from "@/app/online/online-context";
import AuthButton from "@/components/auth/AuthButton";
import { registerUserBadge } from "@/components/auth/userBadgePresence";
import SeatMediaControls from "@/components/rtc/SeatMediaControls";
import CacheSettingsSection from "@/components/settings/CacheSettingsSection";
import NotificationSettingsSection from "@/components/settings/NotificationSettingsSection";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { FEATURE_CARD_SLEEVES } from "@/lib/config/features";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useLoadingContext } from "@/lib/contexts/LoadingContext";
import { useGameStore } from "@/lib/game/store";
import { useGuestSession } from "@/lib/guest/guestSession";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * UserBadge
 * - Standard user badge used across the app.
 * - Shows avatar/name and a small presence indicator when OnlineContext is available.
 * - Falls back to AuthButton (sign in) if the user is not authenticated.
 * - Includes a tiny dropdown for quick actions/settings.
 */
export default function UserBadge({
  variant = "inline",
  className = "",
  showPresence = true,
  announcePresence = true,
}: {
  variant?: "inline" | "floating";
  className?: string;
  showPresence?: boolean;
  /**
   * Register in the shared badge store so the floating GlobalUserBadge knows a
   * badge is already on screen. Only GlobalUserBadge itself opts out.
   */
  announcePresence?: boolean;
}) {
  const { isLoading: isGlobalLoading } = useLoadingContext();
  // Layout effect so the hand-off happens before paint, with no flash of two.
  useLayoutEffect(() => {
    if (!announcePresence) return;
    return registerUserBadge();
  }, [announcePresence]);
  const { data: session, status, update: updateSession } = useSession();
  const user = session?.user;
  const guestSession = useGuestSession();
  const guest = status === "unauthenticated" ? guestSession.guest : null;
  const userEmailVerifiedRaw =
    (user as { emailVerified?: string | Date | null } | undefined)
      ?.emailVerified ?? null;
  const onlineCtx = useContext(OnlineContext);
  const connected: boolean = onlineCtx ? !!onlineCtx.connected : false;
  const voice = onlineCtx?.voice;
  const hasVoiceContext = !!(onlineCtx?.lobby?.id || onlineCtx?.match?.id);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState(
    () => (user?.email as string | undefined) ?? "",
  );
  const [serverEmail, setServerEmail] = useState(
    () => (user?.email as string | undefined) ?? "",
  );
  const [emailVerified, setEmailVerified] = useState<boolean>(() =>
    Boolean(userEmailVerifiedRaw),
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null | undefined>(
    undefined,
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [verificationSending, setVerificationSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [joinedTournament, setJoinedTournament] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { enabled: colorBlindEnabled, setEnabled: setColorBlindEnabled } =
    useColorBlind();
  const {
    settings: graphicsSettings,
    toggleEnhanced3DCards,
    toggleShowTable,
    setCardPreviewScale,
    setHandCardScale,
    setUiTextScale,
    toggleHandSortOrder,
    toggleGamepadLifeControls,
    togglePreferRaster,
    toggleMonochromeMode,
  } = useGraphicsSettings();
  const contextMenuIcons = useGameStore((s) => s.contextMenuIcons);
  const toggleContextMenuIcons = useGameStore((s) => s.toggleContextMenuIcons);
  const controlScheme = useGameStore((s) => s.controlScheme);
  const toggleControlScheme = useGameStore((s) => s.toggleControlScheme);
  const [showOpponentPlaymat, setShowOpponentPlaymat] = useState(true);
  const [playmatPrefLoading, setPlaymatPrefLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [soatcLinked, setSoatcLinked] = useState<boolean | null>(null);
  const [discordLinked, setDiscordLinked] = useState<boolean | null>(null);

  const SPINNER_CHARS = ["✦", "❊", "✤", "❀", "❇︎"] as const;
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  useEffect(() => {
    if (!isGlobalLoading) return;
    const id = window.setInterval(() => {
      setSpinnerIndex((i) => (i + 1) % SPINNER_CHARS.length);
    }, 150);
    return () => window.clearInterval(id);
  }, [isGlobalLoading, SPINNER_CHARS.length]);

  const handleOpenSettings = useCallback(() => {
    setProfileSuccess(null);
    setProfileError(null);
    setProfileName(user?.name ?? "");
    setProfileEmail((user?.email as string | undefined) ?? "");
    setServerEmail((user?.email as string | undefined) ?? "");
    setEmailVerified(Boolean(userEmailVerifiedRaw));
    setAvatarDataUrl(undefined);
    setOpen(false);
    setSettingsOpen(true);
  }, [user?.email, user?.name, userEmailVerifiedRaw]);
  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    setProfileSuccess(null);
    setProfileError(null);
    setProfileName(user?.name ?? "");
    setProfileEmail((user?.email as string | undefined) ?? "");
    setServerEmail((user?.email as string | undefined) ?? "");
    setEmailVerified(Boolean(userEmailVerifiedRaw));
    setAvatarDataUrl(undefined);
    setVerificationSending(false);
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [user?.email, user?.name, userEmailVerifiedRaw]);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteInProgress(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/profile/delete", { method: "DELETE" });
      const data = (await res.json()) as { error?: string; success?: boolean };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete account");
      }
      // Sign out after successful deletion
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete account",
      );
      setDeleteInProgress(false);
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close settings with Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, handleCloseSettings]);

  useEffect(() => {
    const nextName = user?.name ?? "";
    setProfileName(nextName);
  }, [user?.name]);

  useEffect(() => {
    const nextEmail = (user?.email as string | undefined) ?? "";
    setProfileEmail(nextEmail);
    setServerEmail(nextEmail);
    setEmailVerified(Boolean(userEmailVerifiedRaw));
  }, [user?.email, userEmailVerifiedRaw]);

  useEffect(() => {
    setAvatarDataUrl(undefined);
  }, [user?.image]);

  // Load playmat preference on mount
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const loadPlaymatPref = async () => {
      try {
        const res = await fetch("/api/users/me/playmats/preferences", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { showOpponentPlaymat?: boolean };
        if (!cancelled) {
          setShowOpponentPlaymat(data.showOpponentPlaymat !== false);
        }
      } catch {
        // Ignore errors
      }
    };
    void loadPlaymatPref();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleToggleOpponentPlaymat = useCallback(async () => {
    const newValue = !showOpponentPlaymat;
    setShowOpponentPlaymat(newValue);
    setPlaymatPrefLoading(true);
    try {
      const res = await fetch("/api/users/me/playmats/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOpponentPlaymat: newValue }),
      });
      if (!res.ok) {
        // Revert on failure
        setShowOpponentPlaymat(!newValue);
      }
    } catch {
      // Revert on error
      setShowOpponentPlaymat(!newValue);
    } finally {
      setPlaymatPrefLoading(false);
    }
  }, [showOpponentPlaymat]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          user?: {
            name: string | null;
            image: string | null;
            email: string | null;
            emailVerified: string | null;
          };
        };
        if (!data.user || cancelled) return;
        setProfileName(data.user.name ?? "");
        setProfileEmail(data.user.email ?? "");
        setServerEmail(data.user.email ?? "");
        setEmailVerified(Boolean(data.user.emailVerified));
        setAvatarDataUrl(data.user.image ?? null);
      } catch (error) {
        console.error("Failed to load profile details:", error);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load SOATC linked status
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const loadSoatcStatus = async () => {
      try {
        const res = await fetch("/api/users/me/presence", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { soatcUuid?: string | null };
        if (!cancelled) {
          setSoatcLinked(Boolean(data.soatcUuid));
        }
      } catch {
        // Ignore errors
      }
    };
    void loadSoatcStatus();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load Discord linked status
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const loadDiscordStatus = async () => {
      try {
        const res = await fetch("/api/users/me/discord", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { discordId?: string | null };
        if (!cancelled) {
          setDiscordLinked(Boolean(data.discordId));
        }
      } catch {
        // Ignore errors
      }
    };
    void loadDiscordStatus();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const sendVerificationLink = useCallback(
    async (email: string): Promise<boolean> => {
      setVerificationSending(true);
      try {
        const result = await signIn("email", {
          email,
          callbackUrl: "/",
          redirect: false,
        });
        return Boolean(result?.ok);
      } catch (error) {
        console.error("Verification email error:", error);
        return false;
      } finally {
        setVerificationSending(false);
      }
    },
    [],
  );

  // When opening the menu (or on mount if already open), query current tournaments to detect membership
  useEffect(() => {
    let cancelled = false;
    async function fetchJoinedTournament() {
      if (!session?.user?.id) return;
      try {
        // Only fetch when the menu is opened to avoid background traffic
        if (!open) return;
        const res = await fetch("/api/tournaments");
        if (!res.ok) return;
        const list = (await res.json()) as Array<{
          id: string;
          name: string;
          status: string;
          registeredPlayers?: Array<{
            id: string;
            displayName?: string;
            ready?: boolean;
          }>;
        }>;
        const mine =
          Array.isArray(list) && session.user
            ? list.find(
                (t) =>
                  (t.registeredPlayers || []).some(
                    (p) => p.id === session.user.id,
                  ) && t.status !== "completed",
              )
            : null;
        if (!cancelled)
          setJoinedTournament(mine ? { id: mine.id, name: mine.name } : null);
      } catch {
        if (!cancelled) setJoinedTournament(null);
      }
    }
    void fetchJoinedTournament();
    return () => {
      cancelled = true;
    };
  }, [open, session?.user]);

  // Loading shimmer is handled by cross-fading the spinner over the avatar below.

  if (status === "loading") {
    if (variant === "floating") return null;
    return (
      <div
        className={`h-8 w-8 animate-pulse rounded-full border border-rc-line/18 bg-black/40 ${className}`}
      />
    );
  }

  // Not authenticated: reuse AuthButton (plus the guest name when playing as one)
  if (!user?.id) {
    const guestChip = guest ? (
      <span
        className="whitespace-nowrap rounded-full border border-rc-line/22 bg-black/35 px-3 py-1 font-rc-mono text-xs text-rc-fg-muted"
        title="Playing as a guest - sign in to save decks and use matchmaking"
      >
        Guest · {guest.name}
      </span>
    ) : null;
    if (variant === "floating") {
      return (
        <div
          className={`pointer-events-auto fixed top-3 right-4 z-[70] flex items-center gap-2 ${className}`}
        >
          {guestChip}
          <AuthButton variant="floating" />
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {guestChip}
        <AuthButton />
      </div>
    );
  }

  const shouldShowPresence = showPresence && !!onlineCtx;

  const previewAvatar =
    avatarDataUrl === undefined ? (user?.image ?? null) : avatarDataUrl;

  const handleAvatarFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setProfileError("Avatar must be a PNG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }
    const maxBytes = 512 * 1024; // 512KB cap
    if (file.size > maxBytes) {
      setProfileError("Avatar must be smaller than 512KB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setAvatarDataUrl(result);
        setProfileError(null);
      }
    };
    reader.onerror = () => {
      setProfileError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleProfileSave = async () => {
    const trimmedName = profileName.trim();
    const updates: Record<string, unknown> = {};
    if (trimmedName && trimmedName !== (user?.name || "")) {
      updates.displayName = trimmedName;
    } else if (!trimmedName && user?.name) {
      updates.displayName = "";
    }

    const trimmedEmail = profileEmail.trim();
    const normalizedEmail =
      trimmedEmail.length > 0 ? trimmedEmail.toLowerCase() : "";
    const currentEmailNormalized = serverEmail.trim().toLowerCase();
    if (normalizedEmail !== currentEmailNormalized) {
      if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
        setProfileError("Enter a valid email address.");
        setProfileSuccess(null);
        return;
      }
      updates.email = normalizedEmail || null;
    }

    if (avatarDataUrl !== undefined) {
      updates.avatar = avatarDataUrl ?? null;
    }

    if (Object.keys(updates).length === 0) {
      setProfileError("No changes to save.");
      setProfileSuccess(null);
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      const data = (await res.json()) as {
        error?: string;
        user?: {
          name: string | null;
          image: string | null;
          email: string | null;
          emailVerified: string | null;
        };
        success?: boolean;
        emailChanged?: boolean;
      };

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update profile.");
      }

      if (data.user) {
        // Immediately reflect in UI without storing large data URLs in JWT cookie
        setAvatarDataUrl(data.user.image ?? null);
        if (data.user.name !== undefined) setProfileName(data.user.name ?? "");
        setProfileEmail(data.user.email ?? "");
        setServerEmail(data.user.email ?? "");
        setEmailVerified(Boolean(data.user.emailVerified));
      }

      if (data.user && typeof updateSession === "function") {
        await updateSession({
          name: data.user.name ?? undefined,
          email: data.user.email ?? null,
        });
      }

      // Update socket server's cached display name so chat/players tab reflects the change
      if (data.user?.name && onlineCtx?.transport) {
        onlineCtx.transport.updateDisplayName(data.user.name);
      }

      let successMessage = "Profile updated.";

      if (data.emailChanged) {
        if (data.user?.email) {
          const sent = await sendVerificationLink(data.user.email);
          if (sent) {
            successMessage = `Profile updated. Verification email sent to ${data.user.email}.`;
            setEmailVerified(false);
          } else {
            successMessage = "Profile updated.";
            setProfileError(
              "Profile updated, but we couldn't send a verification email. Try again below.",
            );
          }
        } else {
          successMessage = "Profile updated. Email removed.";
          setEmailVerified(false);
        }
      }

      setProfileSuccess(successMessage);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Update failed.",
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (verificationSending) return;
    const trimmed = profileEmail.trim().toLowerCase();
    setProfileSuccess(null);
    setProfileError(null);
    if (!trimmed) {
      setProfileError("Enter an email address first.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setProfileError("Enter a valid email address.");
      return;
    }
    const sent = await sendVerificationLink(trimmed);
    if (sent) {
      setProfileSuccess(`Verification email sent to ${trimmed}.`);
      setEmailVerified(false);
      if (profileEmail !== trimmed) setProfileEmail(trimmed);
    } else {
      setProfileError(
        "We couldn't send the verification email. Try again shortly.",
      );
    }
  };

  const avatarImageSrc = previewAvatar ?? null;
  const presencePillClass = connected
    ? colorBlindEnabled
      ? "bg-rc-info/15 text-rc-info ring-rc-info/30"
      : "bg-rc-success/15 text-rc-success ring-rc-success/30"
    : colorBlindEnabled
      ? "bg-rc-warning/15 text-rc-warning ring-rc-warning/30"
      : "bg-rc-danger/15 text-rc-danger ring-rc-danger/30";
  const presenceDotClass = connected
    ? colorBlindEnabled
      ? "bg-rc-info"
      : "bg-rc-success"
    : colorBlindEnabled
      ? "bg-rc-warning"
      : "bg-rc-danger";
  const normalizedEmailInput = profileEmail.trim().toLowerCase();
  const normalizedServerEmail = serverEmail.trim().toLowerCase();
  const emailDirty = normalizedEmailInput !== normalizedServerEmail;
  const canSendVerification =
    Boolean(normalizedServerEmail) && !emailDirty && !emailVerified;
  const avatar = avatarImageSrc ? (
    <Image
      src={avatarImageSrc}
      alt={user?.name || "User avatar"}
      width={32}
      height={32}
      className="h-8 w-8 rounded-full border border-rc-line/25"
      priority={false}
      unoptimized
    />
  ) : (
    <div className="grid h-8 w-8 place-items-center rounded-full border border-rc-line/25 bg-gradient-to-br from-[#1a2440] to-[#0b1020] font-rc-display text-sm text-rc-fg-muted">
      {(user?.name || "?").slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={
        variant === "floating"
          ? `pointer-events-auto fixed top-3 right-4 z-[70] ${className}`
          : `pointer-events-auto relative ${className}`
      }
    >
      {/* Collapsed trigger: avatar with cross-fade spinner overlay */}
      <div className="relative w-8 h-8">
        <div
          className={`absolute inset-0 grid place-items-center pointer-events-none transition-opacity duration-300 ease-out ${
            isGlobalLoading ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden="true"
        >
          <span className="text-xl opacity-70">
            {SPINNER_CHARS[spinnerIndex]}
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`rounded-full overflow-hidden focus:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring transition-opacity duration-300 ease-out ${
            isGlobalLoading ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          title={user?.name || "User"}
        >
          {avatar}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[75] min-w-[220px] origin-top-right">
          <div className="rc-panel p-2 text-sm">
            <div className="px-2 py-1.5 flex items-center gap-2">
              {avatar}
              <div className="min-w-0 flex-1">
                <div className="truncate font-rc-mono text-sm font-semibold text-rc-fg-strong">
                  {user?.name || "User"}
                </div>
                {shouldShowPresence && (
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ring-1 ${presencePillClass}`}
                      title={
                        connected
                          ? "Online services connected"
                          : "Online services disconnected"
                      }
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${presenceDotClass}`}
                      />
                      {connected ? "Online" : "Offline"}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleOpenSettings}
                className="ml-2 cursor-pointer rounded-rc-sm p-1 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-accent-ring"
                title="User Settings"
                aria-label="Open user settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
            <div className="my-2 h-px bg-rc-line/12" />
            {voice && voice.enabled && voice.rtc.featureEnabled && (
              <div className="mb-2 rounded-rc-md border border-rc-line/12 bg-black/30 px-2 py-2">
                <div className="flex items-center justify-between font-rc-mono text-xs text-rc-fg">
                  <span className="rc-eyebrow">
                    Voice Chat
                  </span>
                  <span
                    className={`text-[10px] uppercase ${
                      voice.rtc.state === "connected"
                        ? "text-rc-success"
                        : voice.rtc.state === "joining" ||
                            voice.rtc.state === "negotiating"
                          ? "text-rc-warning"
                          : "text-rc-fg-subtle"
                    }`}
                  >
                    {voice.rtc.state}
                  </span>
                </div>
                {!hasVoiceContext && (
                  <p className="mt-2 font-rc-mono text-[11px] text-rc-fg-subtle">
                    Join a lobby or match to start a voice call.
                  </p>
                )}
                <div className="mt-2">
                  <SeatMediaControls
                    rtc={voice.rtc}
                    className="w-full flex-wrap justify-start gap-2 rounded-rc-md border border-rc-line/12 bg-black/30"
                    playbackEnabled={voice.playbackEnabled}
                    onTogglePlayback={voice.setPlaybackEnabled}
                    renderAudioElement={false}
                    menuAlignment="right"
                    onRequestConnection={voice.requestConnection}
                    targetPlayerId={(() => {
                      // Find opponent in current match/lobby
                      const currentPlayers =
                        onlineCtx?.match?.players ??
                        onlineCtx?.lobby?.players ??
                        [];
                      const myId = onlineCtx?.me?.id;
                      const opponent = currentPlayers.find(
                        (p) => p.id !== myId,
                      );
                      return opponent?.id ?? null;
                    })()}
                  />
                </div>
                {voice.connectedPeers.length > 0 && (
                  <div className="mt-2 font-rc-mono text-[11px] text-rc-fg-muted">
                    <span className="rc-eyebrow mr-1">
                      Connected:
                    </span>
                    <span className="text-rc-fg-strong">
                      {voice.connectedPeers
                        .map(
                          (peer) =>
                            peer.displayName || `Player ${peer.id.slice(-4)}`,
                        )
                        .join(", ")}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="px-2 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/");
                }}
                className="w-full cursor-pointer rounded-rc-sm px-2 py-1 text-left font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-muted transition-colors hover:bg-rc-accent/10 hover:text-rc-accent-ring"
              >
                Home
              </button>
            </div>
            {joinedTournament && (
              <div className="px-2 py-1.5">
                <button
                  onClick={() => {
                    setOpen(false);
                    router.push(`/tournaments/${joinedTournament.id}`);
                  }}
                  className="w-full cursor-pointer rounded-rc-sm px-2 py-1 text-left font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-muted transition-colors hover:bg-rc-accent/10 hover:text-rc-accent-ring"
                  title={joinedTournament.name}
                >
                  My Tournament
                </button>
              </div>
            )}
            <div className="px-2 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/online/lobby");
                }}
                className="w-full cursor-pointer rounded-rc-sm px-2 py-1 text-left font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-muted transition-colors hover:bg-rc-accent/10 hover:text-rc-accent-ring"
              >
                Lobby
              </button>
            </div>
            <div className="px-2 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/decks");
                }}
                className="w-full cursor-pointer rounded-rc-sm px-2 py-1 text-left font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-muted transition-colors hover:bg-rc-accent/10 hover:text-rc-accent-ring"
              >
                Decks
              </button>
            </div>
            <div className="px-2 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/cubes");
                }}
                className="w-full cursor-pointer rounded-rc-sm px-2 py-1 text-left font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-fg-muted transition-colors hover:bg-rc-accent/10 hover:text-rc-accent-ring"
              >
                Cubes
              </button>
            </div>
            <div className="px-2 py-1.5">
              <button
                onClick={async () => {
                  try {
                    await signOut({ callbackUrl: "/" });
                  } catch {}
                }}
                className="w-full cursor-pointer rounded-rc-sm px-2 py-1 text-left font-rc-mono text-xs uppercase tracking-[0.14em] text-rc-danger transition-colors hover:bg-rc-danger/12 hover:text-rc-danger-hover"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Settings overlay. Portaled to <body>: the nav header's backdrop blur
          would otherwise confine this fixed overlay to the header. */}
      {settingsOpen &&
        createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(6,10,20,0.82)] p-4 backdrop-blur-[4px]"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) handleCloseSettings();
          }}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="rc-panel thin-scrollbar relative max-h-[90vh] w-full max-w-xl overflow-y-auto bg-[rgb(9,13,25)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_18px_rgba(243,207,106,0.2)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
                User Settings
              </h2>
              <button
                onClick={handleCloseSettings}
                className="cursor-pointer rounded-rc-sm p-1 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 font-rc-mono text-xs text-rc-fg-muted">
                <span>Email Address (optional)</span>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => {
                    setProfileEmail(e.currentTarget.value);
                    setProfileSuccess(null);
                    setProfileError(null);
                  }}
                  autoComplete="email"
                  className="rc-input h-9"
                  placeholder="you@example.com"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 font-rc-mono text-[11px] text-rc-fg-subtle">
                <span className="leading-tight">
                  {normalizedServerEmail || profileEmail.trim()
                    ? emailDirty
                      ? "Save to apply your email changes."
                      : emailVerified
                        ? "Email verified."
                        : "Email pending verification."
                    : "Add an email to enable magic link sign-in."}
                </span>
                {canSendVerification && (
                  <button
                    type="button"
                    onClick={handleSendVerificationEmail}
                    disabled={verificationSending}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-rc-sm border border-rc-line/22 px-2 py-1 font-rc-mono text-[11px] text-rc-fg transition-colors hover:border-rc-accent hover:text-rc-accent-ring ${
                      verificationSending ? "cursor-progress opacity-60" : ""
                    }`}
                  >
                    {verificationSending
                      ? "Sending…"
                      : "Send verification email"}
                  </button>
                )}
              </div>
              <label className="flex flex-col gap-1 font-rc-mono text-xs text-rc-fg-muted">
                <span>Display Name</span>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.currentTarget.value)}
                  maxLength={40}
                  className="rc-input h-9"
                  placeholder="Enter your name"
                />
              </label>
              {/* Settings toggles in a compact grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Color blind mode */}
                <button
                  type="button"
                  onClick={() => setColorBlindEnabled(!colorBlindEnabled)}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    colorBlindEnabled
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Color blind
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Accessible colors
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      colorBlindEnabled ? "bg-rc-accent" : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={toggleMonochromeMode}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    graphicsSettings.monochromeMode
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Monochrome
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Black and white UI
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      graphicsSettings.monochromeMode
                        ? "bg-rc-accent"
                        : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Enhanced 3D Cards */}
                <button
                  type="button"
                  onClick={toggleEnhanced3DCards}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    graphicsSettings.enhanced3DCards
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Enhanced 3D
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Lit cards with depth
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      graphicsSettings.enhanced3DCards
                        ? "bg-rc-accent"
                        : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Show opponent's playmat */}
                <button
                  type="button"
                  onClick={handleToggleOpponentPlaymat}
                  disabled={playmatPrefLoading}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    playmatPrefLoading ? "opacity-60 cursor-wait" : ""
                  } ${
                    showOpponentPlaymat
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Opponent mat
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Show custom playmats
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      showOpponentPlaymat ? "bg-rc-accent" : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Show 3D table */}
                <button
                  type="button"
                  onClick={toggleShowTable}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    graphicsSettings.showTable
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      3D Table
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Wooden table model
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      graphicsSettings.showTable
                        ? "bg-rc-accent"
                        : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Hand sort order */}
                <button
                  type="button"
                  onClick={toggleHandSortOrder}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    graphicsSettings.handSortOrder === "spellsFirst"
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Hand sort
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      {graphicsSettings.handSortOrder === "spellsFirst"
                        ? "Spells first"
                        : "Sites first"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      graphicsSettings.handSortOrder === "spellsFirst"
                        ? "bg-rc-accent"
                        : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Gamepad life controls */}
                <button
                  type="button"
                  onClick={toggleGamepadLifeControls}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    graphicsSettings.gamepadLifeControls
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Gamepad life
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      LB/RB for ±life
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      graphicsSettings.gamepadLifeControls
                        ? "bg-rc-accent"
                        : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Performance: Prefer Raster Textures */}
                <button
                  type="button"
                  onClick={togglePreferRaster}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    graphicsSettings.preferRaster
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Lite Textures
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Faster on old hardware
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      graphicsSettings.preferRaster
                        ? "bg-rc-accent"
                        : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* Icon-based context menu */}
                <button
                  type="button"
                  onClick={toggleContextMenuIcons}
                  className={`flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    contextMenuIcons
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      Icon Menu
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Compact context menu
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      contextMenuIcons ? "bg-rc-accent" : "bg-rc-fg-dim"
                    }`}
                  />
                </button>

                {/* TTS control scheme (desktop only) */}
                <button
                  type="button"
                  onClick={toggleControlScheme}
                  className={`hidden [@media(pointer:fine)]:flex items-center justify-between gap-2 rounded-rc-md border px-3 py-2.5 text-left transition-colors ${
                    controlScheme === "tts"
                      ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                      : "border-rc-line/12 bg-black/30"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-rc-mono text-xs font-medium text-rc-fg-strong">
                      TTS Controls
                    </div>
                    <div className="truncate font-rc-mono text-[10px] text-rc-fg-subtle">
                      Tabletop Simulator style
                    </div>
                  </div>
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      controlScheme === "tts" ? "bg-rc-accent" : "bg-rc-fg-dim"
                    }`}
                  />
                </button>
              </div>

              {/* Scale sliders - Card Preview, Hand Cards, and Text Size */}
              <div className="mt-3 px-1 grid grid-cols-3 gap-3">
                {/* Card Preview Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-rc-mono text-[11px] font-medium text-rc-fg-strong">
                      Card Preview
                    </span>
                    <span className="font-rc-mono text-[10px] tabular-nums text-rc-fg-subtle">
                      {Math.round(graphicsSettings.cardPreviewScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="250"
                    step="10"
                    value={graphicsSettings.cardPreviewScale * 100}
                    onChange={(e) =>
                      setCardPreviewScale(Number(e.target.value) / 100)
                    }
                    className="rc-range w-full"
                  />
                </div>
                {/* Hand Card Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-rc-mono text-[11px] font-medium text-rc-fg-strong">
                      Hand Cards
                    </span>
                    <span className="font-rc-mono text-[10px] tabular-nums text-rc-fg-subtle">
                      {Math.round((graphicsSettings.handCardScale ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    step="10"
                    value={(graphicsSettings.handCardScale ?? 1) * 100}
                    onChange={(e) =>
                      setHandCardScale(Number(e.target.value) / 100)
                    }
                    className="rc-range w-full"
                  />
                </div>
                {/* Text Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-rc-mono text-[11px] font-medium text-rc-fg-strong">
                      Text Size
                    </span>
                    <span className="font-rc-mono text-[10px] tabular-nums text-rc-fg-subtle">
                      {Math.round(graphicsSettings.uiTextScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="10"
                    value={graphicsSettings.uiTextScale * 100}
                    onChange={(e) =>
                      setUiTextScale(Number(e.target.value) / 100)
                    }
                    className="rc-range w-full"
                  />
                </div>
              </div>

              {/* Card Image Cache section */}
              <CacheSettingsSection />

              {/* Browser Notifications section */}
              <div className="mt-2 border-t border-rc-line/12 pt-3">
                <NotificationSettingsSection />
              </div>

              {/* Leagues section */}
              <div className="mt-2 border-t border-rc-line/12 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rc-eyebrow">
                    Leagues &amp; Communities
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseSettings();
                    router.push("/settings/soatc");
                  }}
                  className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-rc-md border border-rc-line/14 bg-rc-line/6 px-4 font-rc-sans text-sm font-medium text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8"
                >
                  <span>Sorcerers at the Core</span>
                  {soatcLinked ? (
                    <span className="font-rc-mono text-[10px] text-rc-success">
                      Account linked
                    </span>
                  ) : (
                    <span className="font-rc-mono text-[10px] text-rc-fg-subtle">
                      Link your account
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseSettings();
                    router.push("/settings/discord");
                  }}
                  className="mt-1 flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-rc-md border border-rc-line/14 bg-rc-line/6 px-4 font-rc-sans text-sm font-medium text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8"
                >
                  <span>Discord &amp; Leagues</span>
                  {discordLinked ? (
                    <span className="font-rc-mono text-[10px] text-rc-success">
                      Discord linked
                    </span>
                  ) : (
                    <span className="font-rc-mono text-[10px] text-rc-fg-subtle">
                      Link Discord account
                    </span>
                  )}
                </button>
              </div>
              {/* Patron Perks section */}
              <div className="mt-2 border-t border-rc-line/12 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rc-eyebrow">
                    Patron Perks
                  </span>
                  <span className="font-rc-mono text-[10px] tabular-nums text-rc-fg-subtle">
                    Thank you for your support!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseSettings();
                    router.push("/settings/playmat");
                  }}
                  className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-rc-md border border-rc-accent/35 bg-rc-accent/16 px-4 font-rc-sans text-sm font-medium text-rc-accent-link transition-colors hover:border-rc-accent hover:bg-rc-accent/24"
                >
                  <span>Custom Playmat</span>
                  <span className="font-rc-mono text-[10px] text-rc-fg-subtle">
                    Upload your own
                  </span>
                </button>
                {FEATURE_CARD_SLEEVES && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseSettings();
                      router.push("/settings/cardbacks");
                    }}
                    className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-rc-md border border-rc-accent/35 bg-rc-accent/16 px-4 font-rc-sans text-sm font-medium text-rc-accent-link transition-colors hover:border-rc-accent hover:bg-rc-accent/24"
                  >
                    <span>Custom Card Sleeves</span>
                    <span className="font-rc-mono text-[10px] text-rc-fg-subtle">
                      Visible to opponents
                    </span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-rc-line/25 bg-gradient-to-br from-[#1a2440] to-[#0b1020]">
                  {previewAvatar ? (
                    <img
                      src={previewAvatar}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-rc-display text-xl text-rc-fg-muted">
                      {(profileName || user?.name || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-rc-md border border-rc-line/28 px-3 font-rc-sans text-sm text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={handleAvatarFileChange}
                    />
                    Upload Image
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarDataUrl(undefined);
                      setProfileError(null);
                      setProfileSuccess(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="h-9 cursor-pointer rounded-rc-md border border-rc-line/28 px-3 font-rc-sans text-sm text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8"
                    title="Use current avatar"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarDataUrl(null);
                      setProfileError(null);
                      setProfileSuccess(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="h-9 cursor-pointer rounded-rc-md border border-rc-danger/40 bg-rc-danger/12 px-3 font-rc-sans text-sm text-rc-danger transition-colors hover:bg-rc-danger/20"
                    title="Remove avatar"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {profileError && (
                <p className="font-rc-mono text-[11px] text-rc-danger">{profileError}</p>
              )}
              {profileSuccess && (
                <p className="font-rc-mono text-[11px] text-rc-success">{profileSuccess}</p>
              )}
              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseSettings}
                  className="h-9 cursor-pointer rounded-rc-md border border-rc-line/28 px-3 font-rc-sans text-sm text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleProfileSave();
                    // Keep overlay open but reflect saved state
                  }}
                  disabled={profileSaving}
                  className={`h-9 cursor-pointer rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-4 font-rc-sans text-sm font-medium text-rc-accent-fg shadow-rc-sm transition-transform hover:-translate-y-px ${
                    profileSaving ? "cursor-progress opacity-60" : ""
                  }`}
                >
                  {profileSaving ? "Saving…" : "Save"}
                </button>
              </div>

              {/* Delete account section */}
              <div className="mt-4 border-t border-rc-line/12 pt-4">
                {!deleteConfirmOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="cursor-pointer font-rc-mono text-[11px] text-rc-fg-subtle underline underline-offset-4 transition-colors hover:text-rc-danger"
                  >
                    Delete my account and data
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="font-rc-mono text-[11px] leading-relaxed text-rc-danger">
                      This will permanently delete your account, decks, cubes,
                      and all associated data. This cannot be undone.
                    </p>
                    {deleteError && (
                      <p className="font-rc-mono text-[11px] text-rc-danger">{deleteError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          setDeleteError(null);
                        }}
                        className="h-7 cursor-pointer rounded-rc-md border border-rc-line/28 px-2 font-rc-mono text-[11px] text-rc-fg transition-colors hover:border-rc-accent hover:text-rc-accent-ring"
                        disabled={deleteInProgress}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        disabled={deleteInProgress}
                        className={`h-7 cursor-pointer rounded-rc-md border border-white/8 bg-rc-danger px-3 font-rc-mono text-[11px] font-semibold text-[#faf3e5] transition-colors hover:bg-rc-danger-hover ${
                          deleteInProgress ? "cursor-progress opacity-60" : ""
                        }`}
                      >
                        {deleteInProgress
                          ? "Deleting…"
                          : "Yes, delete my account"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
