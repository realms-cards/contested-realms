"use client";

import { Settings, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut, signIn } from "next-auth/react";
import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { OnlineContext } from "@/app/online/online-context";
import AuthButton from "@/components/auth/AuthButton";
import SeatMediaControls from "@/components/rtc/SeatMediaControls";
import CacheSettingsSection from "@/components/settings/CacheSettingsSection";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useLoadingContext } from "@/lib/contexts/LoadingContext";

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
}: {
  variant?: "inline" | "floating";
  className?: string;
  showPresence?: boolean;
}) {
  const { isLoading: isGlobalLoading } = useLoadingContext();
  const { data: session, status, update: updateSession } = useSession();
  const user = session?.user;
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
    () => (user?.email as string | undefined) ?? ""
  );
  const [serverEmail, setServerEmail] = useState(
    () => (user?.email as string | undefined) ?? ""
  );
  const [emailVerified, setEmailVerified] = useState<boolean>(() =>
    Boolean(userEmailVerifiedRaw)
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null | undefined>(
    undefined
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        error instanceof Error ? error.message : "Failed to delete account"
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
    []
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
                    (p) => p.id === session.user.id
                  ) && t.status !== "completed"
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
        className={`w-8 h-8 rounded-full bg-slate-800/80 animate-pulse ${className}`}
      />
    );
  }

  // Not authenticated: reuse AuthButton
  if (!user?.id) {
    if (variant === "floating") {
      return (
        <div
          className={`pointer-events-auto fixed top-3 right-4 z-[70] ${className}`}
        >
          <AuthButton variant="floating" />
        </div>
      );
    }
    return <AuthButton className={className} />;
  }

  const shouldShowPresence = showPresence && !!onlineCtx;

  const previewAvatar =
    avatarDataUrl === undefined ? user?.image ?? null : avatarDataUrl;

  const handleAvatarFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event
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
              "Profile updated, but we couldn't send a verification email. Try again below."
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
        error instanceof Error ? error.message : "Update failed."
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
        "We couldn't send the verification email. Try again shortly."
      );
    }
  };

  const avatarImageSrc = previewAvatar ?? null;
  const presencePillClass = connected
    ? colorBlindEnabled
      ? "bg-sky-500/15 text-sky-300 ring-sky-500/30"
      : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
    : colorBlindEnabled
    ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
    : "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  const presenceDotClass = connected
    ? colorBlindEnabled
      ? "bg-sky-400"
      : "bg-emerald-400"
    : colorBlindEnabled
    ? "bg-amber-400"
    : "bg-rose-400";
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
      className="rounded-full w-8 h-8"
      priority={false}
      unoptimized
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-slate-700 text-white grid place-items-center text-[12px]">
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
          className={`rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/30 transition-opacity duration-300 ease-out ${
            isGlobalLoading ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          title={user?.name || "User"}
        >
          {avatar}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[75] min-w-[220px] origin-top-right">
          <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 shadow-xl p-2 text-sm">
            <div className="px-2 py-1.5 flex items-center gap-2">
              {avatar}
              <div className="min-w-0 flex-1">
                <div className="text-slate-200 text-sm truncate">
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
                className="ml-2 p-1 rounded hover:bg-white/10 text-slate-300"
                title="User Settings"
                aria-label="Open user settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
            <div className="my-2 h-px bg-white/10" />
            {voice && voice.enabled && voice.rtc.featureEnabled && (
              <div className="px-2 py-2 mb-2 rounded-md bg-slate-800/70 ring-1 ring-slate-700/50">
                <div className="flex items-center justify-between text-xs text-slate-200">
                  <span className="font-semibold tracking-wide uppercase">
                    Voice Chat
                  </span>
                  <span
                    className={`text-[10px] uppercase ${
                      voice.rtc.state === "connected"
                        ? "text-emerald-300"
                        : voice.rtc.state === "joining" ||
                          voice.rtc.state === "negotiating"
                        ? "text-amber-300"
                        : "text-slate-400"
                    }`}
                  >
                    {voice.rtc.state}
                  </span>
                </div>
                {!hasVoiceContext && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Join a lobby or match to start a voice call.
                  </p>
                )}
                <div className="mt-2">
                  <SeatMediaControls
                    rtc={voice.rtc}
                    className="w-full flex-wrap justify-start gap-2 bg-slate-900/70 ring-1 ring-white/5"
                    playbackEnabled={voice.playbackEnabled}
                    onTogglePlayback={voice.setPlaybackEnabled}
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
                        (p) => p.id !== myId
                      );
                      return opponent?.id ?? null;
                    })()}
                  />
                </div>
                {voice.connectedPeers.length > 0 && (
                  <div className="mt-2 text-[11px] text-slate-300">
                    <span className="uppercase tracking-wide text-slate-400 mr-1">
                      Connected:
                    </span>
                    <span className="text-slate-100">
                      {voice.connectedPeers
                        .map(
                          (peer) =>
                            peer.displayName || `Player ${peer.id.slice(-4)}`
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
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
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
                  className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
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
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
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
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
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
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
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
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-rose-300"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Settings overlay */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) handleCloseSettings();
          }}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="relative w-full max-w-md rounded-xl bg-slate-900 ring-1 ring-slate-800 shadow-2xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                User Settings
              </h2>
              <button
                onClick={handleCloseSettings}
                className="p-1 rounded hover:bg-white/10 text-slate-300"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
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
                  className="h-9 rounded bg-slate-800 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/60"
                  placeholder="you@example.com"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
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
                    className={`inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20 ${
                      verificationSending ? "opacity-60 cursor-progress" : ""
                    }`}
                  >
                    {verificationSending
                      ? "Sending…"
                      : "Send verification email"}
                  </button>
                )}
              </div>
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>Display Name</span>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.currentTarget.value)}
                  maxLength={40}
                  className="h-9 rounded bg-slate-800 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/60"
                  placeholder="Enter your name"
                />
              </label>
              <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                <div className="flex flex-col">
                  <span>Color blind mode</span>
                  <span className="mt-0.5 text-[11px] text-slate-400">
                    Switch greens to blues and reds to yellows in the UI.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setColorBlindEnabled(!colorBlindEnabled)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] ring-1 transition-colors ${
                    colorBlindEnabled
                      ? "bg-sky-500/20 text-sky-100 ring-sky-500/40"
                      : "bg-slate-800 text-slate-200 ring-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      colorBlindEnabled ? "bg-sky-300" : "bg-slate-400"
                    }`}
                  />
                  <span>{colorBlindEnabled ? "On" : "Off"}</span>
                </button>
              </div>
              {/* Card Image Cache section */}
              <CacheSettingsSection />
              {/* Patron Perks section */}
              <div className="mt-2 pt-3 border-t border-slate-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-amber-400">
                    Patron Perks
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Thank you for your support!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseSettings();
                    router.push("/settings/playmat");
                  }}
                  className="w-full flex items-center justify-between gap-2 h-10 px-4 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 ring-1 ring-amber-500/30 text-sm font-medium text-amber-100 hover:from-amber-500/30 hover:to-orange-500/30 transition-all"
                >
                  <span>Custom Playmat</span>
                  <span className="text-[10px] text-amber-300/70">
                    Upload your own
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                  {previewAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewAvatar}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-base text-slate-300">
                      {(profileName || user?.name || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-2 h-9 px-3 rounded bg-white/10 text-sm text-white cursor-pointer hover:bg-white/20">
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
                    className="h-9 px-3 rounded bg-white/10 text-sm text-white hover:bg-white/20"
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
                    className="h-9 px-3 rounded bg-rose-500/20 text-sm text-rose-200 hover:bg-rose-500/30"
                    title="Remove avatar"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {profileError && (
                <p className="text-[11px] text-rose-300">{profileError}</p>
              )}
              {profileSuccess && (
                <p className="text-[11px] text-emerald-300">{profileSuccess}</p>
              )}
              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseSettings}
                  className="h-9 px-3 rounded bg-white/10 text-sm text-white hover:bg-white/20"
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
                  className={`h-9 px-4 rounded bg-purple-600 text-sm font-semibold text-white hover:bg-purple-500 transition-colors ${
                    profileSaving ? "opacity-60 cursor-progress" : ""
                  }`}
                >
                  {profileSaving ? "Saving…" : "Save"}
                </button>
              </div>

              {/* Delete account section */}
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                {!deleteConfirmOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="text-[11px] text-slate-400 hover:text-rose-300 underline"
                  >
                    Delete my account and data
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-rose-300">
                      This will permanently delete your account, decks, cubes,
                      and all associated data. This cannot be undone.
                    </p>
                    {deleteError && (
                      <p className="text-[11px] text-rose-400">{deleteError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          setDeleteError(null);
                        }}
                        className="h-7 px-2 rounded bg-white/10 text-[11px] text-white hover:bg-white/20"
                        disabled={deleteInProgress}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAccount}
                        disabled={deleteInProgress}
                        className={`h-7 px-3 rounded bg-rose-600 text-[11px] font-semibold text-white hover:bg-rose-500 ${
                          deleteInProgress ? "opacity-60 cursor-progress" : ""
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
        </div>
      )}
    </div>
  );
}
