/**
 * Device Selection Menu Component
 * Dropdown menu for selecting audio and video input devices
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RcButton } from "@/components/ui/rc-button";
import type { DeviceSelectionMenuProps } from "@/lib/rtc/types";
import { getDeviceDisplayName } from "@/lib/utils/webrtc-devices";

export const DeviceSelectionMenu: React.FC<DeviceSelectionMenuProps> = ({
  audioDevices,
  videoDevices,
  selectedAudioId,
  selectedVideoId,
  onAudioDeviceChange,
  onVideoDeviceChange,
  onRefreshDevices,
  isOpen,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }

    return undefined;
  }, [isOpen, onClose]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      return () => document.removeEventListener("keydown", handleEscapeKey);
    }

    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const sectionLabelClass =
    "font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-fg-dim";

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[rgba(6,10,20,0.6)] z-[9998]"
        onClick={onClose}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="
          rc-panel thin-scrollbar
          fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
          w-96 max-w-[90vw] max-h-[80vh] overflow-y-auto
          z-50
        "
      >
        {/* Header */}
        <div className="rc-panel-head">
          <h3 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">
            Device Settings
          </h3>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-rc-md p-1 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-accent-ring"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-[18px] py-3.5 space-y-6">
          {/* Audio Devices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className={sectionLabelClass}>Microphone</h4>
              <span className="rc-hint">
                {audioDevices.length} device
                {audioDevices.length !== 1 ? "s" : ""} available
              </span>
            </div>

            {audioDevices.length === 0 ? (
              <div className="rc-hint">No audio devices found</div>
            ) : (
              <div className="space-y-2">
                {audioDevices.map((device) => (
                  <label
                    key={device.deviceId}
                    className="rc-check flex w-full items-center gap-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-2 hover:border-rc-accent/40"
                  >
                    <input
                      type="radio"
                      name="audioDevice"
                      value={device.deviceId}
                      checked={selectedAudioId === device.deviceId}
                      onChange={() => onAudioDeviceChange(device.deviceId)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-rc-sans text-sm text-rc-fg-strong">
                        {getDeviceDisplayName(device)}
                      </div>
                      {device.deviceId === "default" && (
                        <div className="font-rc-mono text-[11px] tracking-[0.1em] text-rc-accent-link">
                          System Default
                        </div>
                      )}
                    </div>
                    {selectedAudioId === device.deviceId && (
                      <svg
                        className="w-4 h-4 text-rc-success"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Video Devices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className={sectionLabelClass}>Camera</h4>
              <span className="rc-hint">
                {videoDevices.length} device
                {videoDevices.length !== 1 ? "s" : ""} available
              </span>
            </div>

            {videoDevices.length === 0 ? (
              <div className="rc-hint">No video devices found</div>
            ) : (
              <div className="space-y-2">
                {videoDevices.map((device) => (
                  <label
                    key={device.deviceId}
                    className="rc-check flex w-full items-center gap-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-2 hover:border-rc-accent/40"
                  >
                    <input
                      type="radio"
                      name="videoDevice"
                      value={device.deviceId}
                      checked={selectedVideoId === device.deviceId}
                      onChange={() => onVideoDeviceChange(device.deviceId)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-rc-sans text-sm text-rc-fg-strong">
                        {getDeviceDisplayName(device)}
                      </div>
                      {device.deviceId === "default" && (
                        <div className="font-rc-mono text-[11px] tracking-[0.1em] text-rc-accent-link">
                          System Default
                        </div>
                      )}
                    </div>
                    {selectedVideoId === device.deviceId && (
                      <svg
                        className="w-4 h-4 text-rc-success"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 border-t border-rc-line/12 pt-4">
            <RcButton variant="ghost" size="sm" onClick={onRefreshDevices}>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Devices
            </RcButton>

            <RcButton onClick={onClose}>Done</RcButton>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
};
