"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/notifications/browserNotifications";

/**
 * Settings section for browser notification preferences.
 * Shows current permission state and allows requesting permission.
 */
export default function NotificationSettingsSection() {
  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
  const [supported, setSupported] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setSupported(isNotificationSupported());
    setPermission(getNotificationPermission());
  }, []);

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
    } finally {
      setRequesting(false);
    }
  }, []);

  if (!supported) {
    return <div className="rc-hint">browser notifications not supported</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rc-eyebrow">Browser notifications</span>
        {permission === "granted" && <Badge tone="ok">enabled</Badge>}
        {permission === "denied" && <Badge tone="warn">blocked</Badge>}
      </div>

      {permission === "granted" && (
        <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
          You&apos;ll receive notifications for invites and lobby joins
        </p>
      )}

      {permission === "denied" && (
        <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
          Enable in browser settings to receive notifications
        </p>
      )}

      {permission === "default" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
            Get notified when you receive match invites or players join your
            lobby
          </span>
          <RcButton
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleRequestPermission}
            disabled={requesting}
          >
            {requesting ? "Requesting..." : "Enable"}
          </RcButton>
        </div>
      )}
    </div>
  );
}
