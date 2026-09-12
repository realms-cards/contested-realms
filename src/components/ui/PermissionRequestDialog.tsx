/**
 * Permission Request Dialog Component
 * Modal dialog for requesting camera and microphone permissions
 */

import React, { useEffect, useRef } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import type { PermissionRequestDialogProps } from "@/lib/rtc/types";

export const PermissionRequestDialog: React.FC<
  PermissionRequestDialogProps
> = ({ isOpen, onRequestPermissions, onCancel, permissionType }) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Focus management for accessibility. RcDialog mounts its portal after the
  // first paint, so focus the dialog's first button on the next tick.
  useEffect(() => {
    if (!isOpen) return undefined;

    const timeout = window.setTimeout(() => {
      const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]');
      dialog?.querySelector("button")?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const getPermissionText = () => {
    switch (permissionType) {
      case "camera":
        return {
          title: "Camera Access Required",
          description:
            "This application needs access to your camera to enable video chat.",
          icon: (
            <svg
              className="w-12 h-12 text-rc-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"
              />
            </svg>
          ),
        };
      case "microphone":
        return {
          title: "Microphone Access Required",
          description:
            "This application needs access to your microphone to enable voice chat.",
          icon: (
            <svg
              className="w-12 h-12 text-rc-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          ),
        };
      case "both":
      default:
        return {
          title: "Camera & Microphone Access Required",
          description:
            "This application needs access to your camera and microphone to enable video and voice chat.",
          icon: (
            <svg
              className="w-12 h-12 text-rc-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.5-4.5L21 7M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
          ),
        };
    }
  };

  const { title, description, icon } = getPermissionText();

  return (
    <RcDialog
      title={title}
      eyebrow="permissions"
      onClose={onCancel}
      closeOnBackdrop={false}
      size="sm"
      actions={
        <>
          <RcButton variant="outline" onClick={onCancel}>
            Cancel
          </RcButton>
          <RcButton onClick={onRequestPermissions}>Allow Permissions</RcButton>
        </>
      }
    >
      <div ref={bodyRef}>
        {/* Icon */}
        <div className="flex items-center justify-center mb-4">{icon}</div>

        {/* Description */}
        <p className="text-sm text-rc-fg-muted text-center mb-6">
          {description}
        </p>

        {/* Browser instructions */}
        <div className="rc-alert" data-tone="info">
          <p className="font-medium mb-1">How to grant permissions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click &quot;Allow Permissions&quot; below</li>
            <li>Your browser will show a permission prompt</li>
            <li>
              Click &quot;Allow&quot; or &quot;Permit&quot; to grant access
            </li>
            <li>If blocked, click the camera icon in your address bar</li>
          </ol>
        </div>
      </div>
    </RcDialog>
  );
};
