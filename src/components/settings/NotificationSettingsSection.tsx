"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
    return (
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <BellOff className="h-4 w-4" />
        <span>Browser notifications not supported</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4" />
        <span>Browser Notifications</span>
      </div>

      {permission === "granted" && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <BellRing className="h-4 w-4" />
          <span>
            Enabled — you&apos;ll receive notifications for invites and lobby
            joins
          </span>
        </div>
      )}

      {permission === "denied" && (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <BellOff className="h-4 w-4" />
          <span>
            Blocked — enable in browser settings to receive notifications
          </span>
        </div>
      )}

      {permission === "default" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            Get notified when you receive match invites or players join your
            lobby
          </span>
          <button
            onClick={handleRequestPermission}
            disabled={requesting}
            className="shrink-0 rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {requesting ? "Requesting..." : "Enable"}
          </button>
        </div>
      )}
    </div>
  );
}
