/**
 * Device Selection Menu Component
 * Dropdown menu for selecting audio and video input devices
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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

  const content = (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-[9998]" onClick={onClose} />

      {/* Menu */}
      <div
        ref={menuRef}
        className="
          fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
          w-96 max-w-[90vw] max-h-[80vh] overflow-y-auto
          bg-white rounded-lg shadow-xl border border-gray-200
          z-50
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Device Settings</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <svg
              className="w-5 h-5 text-gray-400"
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
        <div className="p-4 space-y-6">
          {/* Audio Devices */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Microphone</h4>
              <span className="text-xs text-gray-500">
                {audioDevices.length} device
                {audioDevices.length !== 1 ? "s" : ""} available
              </span>
            </div>

            {audioDevices.length === 0 ? (
              <div className="text-sm text-gray-500 italic">
                No audio devices found
              </div>
            ) : (
              <div className="space-y-2">
                {audioDevices.map((device) => (
                  <label
                    key={device.deviceId}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="audioDevice"
                      value={device.deviceId}
                      checked={selectedAudioId === device.deviceId}
                      onChange={() => onAudioDeviceChange(device.deviceId)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {getDeviceDisplayName(device)}
                      </div>
                      {device.deviceId === "default" && (
                        <div className="text-xs text-blue-600">
                          System Default
                        </div>
                      )}
                    </div>
                    {selectedAudioId === device.deviceId && (
                      <svg
                        className="w-4 h-4 text-green-600"
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
              <h4 className="text-sm font-medium text-gray-900">Camera</h4>
              <span className="text-xs text-gray-500">
                {videoDevices.length} device
                {videoDevices.length !== 1 ? "s" : ""} available
              </span>
            </div>

            {videoDevices.length === 0 ? (
              <div className="text-sm text-gray-500 italic">
                No video devices found
              </div>
            ) : (
              <div className="space-y-2">
                {videoDevices.map((device) => (
                  <label
                    key={device.deviceId}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="videoDevice"
                      value={device.deviceId}
                      checked={selectedVideoId === device.deviceId}
                      onChange={() => onVideoDeviceChange(device.deviceId)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {getDeviceDisplayName(device)}
                      </div>
                      {device.deviceId === "default" && (
                        <div className="text-xs text-blue-600">
                          System Default
                        </div>
                      )}
                    </div>
                    {selectedVideoId === device.deviceId && (
                      <svg
                        className="w-4 h-4 text-green-600"
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
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              onClick={onRefreshDevices}
              className="
                flex items-center gap-2 px-3 py-2
                text-sm text-gray-600 hover:text-gray-900
                hover:bg-gray-50 rounded-md
                transition-colors duration-200
              "
            >
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
            </button>

            <button
              onClick={onClose}
              className="
                px-4 py-2 bg-blue-600 hover:bg-blue-700
                text-white text-sm font-medium rounded-md
                transition-colors duration-200
              "
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
};
