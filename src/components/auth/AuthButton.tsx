"use client";

import { clsx } from "clsx";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut, getProviders } from "next-auth/react";
import type { LiteralUnion, ClientSafeProvider } from "next-auth/react";
import { useEffect, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";

type ProvidersType = Record<
  LiteralUnion<string, string>,
  ClientSafeProvider
> | null;

type AuthButtonProps = {
  variant?: "inline" | "floating";
  className?: string;
};

export default function AuthButton({
  variant = "inline",
  className,
}: AuthButtonProps) {
  const { data: session, status } = useSession();
  const [providers, setProviders] = useState<ProvidersType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [profileName, setProfileName] = useState<string>(
    session?.user?.name ?? ""
  );
  const [profileImage, setProfileImage] = useState<string | null>(
    (session?.user?.image as string | null | undefined) ?? null
  );
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const loadProviders = async (): Promise<void> => {
      try {
        const ps = await getProviders();
        if (mounted) {
          setProviders(ps);
        }
      } catch (error) {
        console.error("Failed to load providers:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadProviders();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setProfileName(session?.user?.name ?? "");
    setProfileImage(
      (session?.user?.image as string | null | undefined) ?? null
    );
  }, [session?.user?.name, session?.user?.image]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;

    const loadProfile = async (): Promise<void> => {
      try {
        const res = await fetch("/api/profile", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          user?: {
            name: string | null;
            image: string | null;
          };
        };
        if (!data.user || cancelled) return;
        setProfileName(data.user.name ?? "");
        setProfileImage(data.user.image ?? null);
      } catch (error) {
        console.error("Failed to refresh profile data:", error);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const handleSignIn = (): void => {
    router.push("/auth/signin");
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Sign-out error:", error);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div
        className={clsx(
          "h-8 animate-pulse rounded-rc-md border border-rc-line/14 bg-rc-line/8",
          variant === "floating" ? "w-[7.5rem]" : "w-24",
          className
        )}
      />
    );
  }

  if (session?.user?.id) {
    return (
      <div
        className={clsx(
          "flex items-center gap-3",
          variant === "floating" && "justify-end",
          className
        )}
      >
        {profileImage && (
          <Image
            src={profileImage}
            alt={profileName || "User avatar"}
            width={32}
            height={32}
            className="rounded-full ring-1 ring-rc-line/22"
            unoptimized
          />
        )}
        <span className="font-rc-mono text-[13px] tracking-[0.04em] text-rc-fg">
          {profileName || session.user.name || "User"}
        </span>
        <RcButton variant="outline" size="sm" onClick={handleSignOut}>
          Sign Out
        </RcButton>
      </div>
    );
  }

  const containerClasses = clsx(
    "flex items-center gap-2",
    variant === "floating" && "justify-end",
    className
  );

  return (
    <div className={containerClasses}>
      <RcButton
        variant="default"
        size="sm"
        onClick={handleSignIn}
        className={clsx(variant === "floating" && "shadow-rc-md")}
      >
        Sign In
      </RcButton>
      {providers?.["2fa"] && process.env.NODE_ENV === "development" && (
        <span className="rc-hint">2fa test available</span>
      )}
    </div>
  );
}
