/**
 * User Avatar Menu Component
 * Shows user avatar with dropdown menu for camera/audio settings
 */

import Image from "next/image";
import React, { useState, useRef, useEffect } from "react";
import { RcButton } from "@/components/ui/rc-button";
import type { UserAvatarMenuProps } from "@/lib/rtc/types";

export const UserAvatarMenu: React.FC<UserAvatarMenuProps> = ({
  userId,
  displayName,
  avatarUrl,
  className = "",
  onSettingsClick,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }

    return undefined;
  }, [isMenuOpen]);

  // Generate initials from display name
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  };

  const handleAvatarClick = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSettingsClick = () => {
    setIsMenuOpen(false);
    onSettingsClick?.();
  };

  const handleSignOut = () => {
    setIsMenuOpen(false);
    // This would typically call an auth context method
    console.log("Sign out clicked");
  };

  const handleProfileClick = () => {
    setIsMenuOpen(false);
    // This would typically navigate to profile page
    console.log("Profile clicked");
  };

  return (
    <div className={`relative ${className}`}>
      {/* Avatar Button */}
      <button
        ref={buttonRef}
        onClick={handleAvatarClick}
        className="
          relative flex cursor-pointer items-center justify-center
          w-10 h-10 rounded-full
          border border-rc-accent/45 bg-rc-accent/14
          transition-all duration-200 ease-out
          focus:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring
          shadow-rc-sm hover:shadow-rc-md
        "
        title={`${displayName} - Click for menu`}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            fill
            sizes="40px"
            className="rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span className="font-rc-mono text-sm font-semibold text-rc-spark">
            {getInitials(displayName)}
          </span>
        )}

        {/* Online indicator */}
        <div
          className="
          absolute -bottom-0.5 -right-0.5
          w-3 h-3 rounded-full
          bg-rc-success border-2 border-rc-floor
        "
        />
      </button>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 bg-transparent z-10 sm:hidden" />

          <div
            ref={menuRef}
            className="
              rc-panel absolute top-full right-0 mt-2 z-20
              w-56 py-1
              transform transition-all duration-200 ease-out
              origin-top-right
            "
          >
            {/* User Info Header */}
            <div className="px-4 py-3 border-b border-rc-line/14">
              <div className="flex items-center gap-3">
                <div
                  className="
                  relative flex items-center justify-center
                  w-8 h-8 rounded-full
                  border border-rc-accent/45 bg-rc-accent/14
                "
                >
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={displayName}
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="font-rc-mono text-xs font-semibold text-rc-spark">
                      {getInitials(displayName)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-rc-display text-[15px] leading-tight text-rc-fg-strong">
                    {displayName}
                  </p>
                  <p className="truncate font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
                    ID: {userId}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1">
              <RcButton
                variant="ghost"
                onClick={handleProfileClick}
                className="w-full justify-start rounded-none px-4"
              >
                <svg
                  className="w-4 h-4 mr-3 text-rc-fg-subtle"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                View Profile
              </RcButton>

              <RcButton
                variant="ghost"
                onClick={handleSettingsClick}
                className="w-full justify-start rounded-none px-4"
              >
                <svg
                  className="w-4 h-4 mr-3 text-rc-fg-subtle"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                General Settings
              </RcButton>

              {/* Divider */}
              <div className="border-t border-rc-line/12 my-1" />

              <RcButton
                variant="ghost"
                onClick={handleSignOut}
                className="w-full justify-start rounded-none px-4 text-rc-danger hover:text-rc-danger-hover"
              >
                <svg
                  className="w-4 h-4 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign Out
              </RcButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * User Avatar Display Component (without menu)
 * For use in other contexts where just the avatar is needed
 */
export const UserAvatar: React.FC<{
  displayName: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ displayName, avatarUrl, size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  };

  return (
    <div
      className={`
      relative flex items-center justify-center
      ${sizeClasses[size]}
      rounded-full
      border border-rc-accent/45 bg-rc-accent/14
      ${className}
    `}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName}
          fill
          sizes={size === "lg" ? "40px" : size === "sm" ? "24px" : "32px"}
          className="rounded-full object-cover"
          unoptimized
        />
      ) : (
        <span className="font-rc-mono font-semibold text-rc-spark">
          {getInitials(displayName)}
        </span>
      )}
    </div>
  );
};
