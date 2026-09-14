/**
 * Connection Status Indicator Component
 * Shows WebRTC connection status with error messages and retry functionality
 */

import React, { useState, useEffect } from "react";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import type { ConnectionStatusIndicatorProps } from "@/lib/rtc/types";

export const ConnectionStatusIndicator: React.FC<
  ConnectionStatusIndicatorProps
> = ({ connectionState, lastError, onRetry, compact = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { enabled: colorBlindEnabled } = useColorBlind();

  // Auto-collapse after success
  useEffect(() => {
    if (connectionState === "connected") {
      const timer = setTimeout(() => setIsExpanded(false), 3000);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [connectionState]);

  // Auto-expand on errors
  useEffect(() => {
    if (connectionState === "failed" && lastError) {
      setIsExpanded(true);
    }

    return undefined;
  }, [connectionState, lastError]);

  const getStatusConfig = () => {
    switch (connectionState) {
      case "idle":
        return {
          color: "gray",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: "text-rc-fg-muted",
          borderColor: "border-rc-line/22",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" />
            </svg>
          ),
          label: "Disconnected",
          description: "Video chat is not active",
        };

      case "joining":
        return {
          color: "blue",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: "text-rc-info",
          borderColor: "border-rc-info/40",
          icon: (
            <svg
              className="w-4 h-4 animate-spin"
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
          ),
          label: "Joining...",
          description: "Joining video chat session",
        };

      case "negotiating":
        return {
          color: "yellow",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: "text-rc-warning",
          borderColor: "border-rc-warning/40",
          icon: (
            <svg
              className="w-4 h-4 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
              />
            </svg>
          ),
          label: "Connecting...",
          description: "Establishing peer connection",
        };

      case "connected":
        return {
          color: colorBlindEnabled ? "blue" : "green",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: colorBlindEnabled ? "text-rc-info" : "text-rc-success",
          borderColor: colorBlindEnabled
            ? "border-rc-info/40"
            : "border-rc-success/40",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: "Connected",
          description: "Video chat is active",
        };

      case "failed":
        return {
          color: colorBlindEnabled ? "yellow" : "red",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: colorBlindEnabled ? "text-rc-warning" : "text-rc-danger",
          borderColor: colorBlindEnabled
            ? "border-rc-warning/40"
            : "border-rc-danger/40",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: "Connection Failed",
          description: lastError || "Unable to establish video connection",
        };

      case "closed":
        return {
          color: "gray",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: "text-rc-fg-muted",
          borderColor: "border-rc-line/22",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
            </svg>
          ),
          label: "Disconnected",
          description: "Video chat session ended",
        };

      default:
        return {
          color: "gray",
          bgColor: "bg-[rgba(7,10,20,0.85)]",
          textColor: "text-rc-fg-muted",
          borderColor: "border-rc-line/22",
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: "Unknown",
          description: "Connection status unavailable",
        };
    }
  };

  const config = getStatusConfig();

  // Don't show indicator for idle state in compact mode unless there's an error
  if (compact && connectionState === "idle" && !lastError) {
    return null;
  }

  // Compact mode - just a status dot with tooltip
  if (compact && !isExpanded) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsExpanded(true)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`
            flex items-center gap-2 px-2 py-1
            ${config.bgColor} ${config.borderColor} ${config.textColor}
            border rounded-full
            hover:shadow-rc-sm transition-all duration-200
            focus:outline-none focus:ring-1 focus:ring-rc-accent-ring
          `}
          title={config.description}
        >
          {config.icon}
          <span className="font-rc-sans text-xs font-medium">{config.label}</span>
        </button>

        {/* Tooltip */}
        {showTooltip && (
          <div
            className="
            absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2
            px-2 py-1 bg-[rgba(7,10,20,0.95)] text-rc-fg font-rc-sans text-xs rounded-rc-sm shadow-rc-md
            whitespace-nowrap z-50
          "
          >
            {config.description}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[rgba(7,10,20,0.95)]" />
          </div>
        )}
      </div>
    );
  }

  // Full status indicator
  return (
    <div
      className={`
      ${config.bgColor} ${config.borderColor}
      border rounded-rc-md shadow-rc-panel text-rc-fg
      transition-all duration-200 ease-out
    `}
    >
      {/* Header */}
      <div
        className={`
        flex items-center justify-between p-3
        ${compact ? "cursor-pointer" : ""}
      `}
        onClick={compact ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <div className="flex items-center gap-2">
          {config.icon}
          <span className={`font-rc-sans text-sm font-medium ${config.textColor}`}>
            {config.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {connectionState === "failed" && onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="
                font-rc-mono text-xs px-2 py-1 bg-black/35 border border-rc-line/22 rounded-rc-sm text-rc-fg-muted
                hover:border-rc-accent hover:text-rc-accent-ring transition-colors duration-200
                focus:outline-none focus:ring-1 focus:ring-rc-accent-ring
              "
            >
              Retry
            </button>
          )}

          {compact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className={`
                p-1 rounded-rc-sm hover:bg-rc-line/6 transition-colors duration-200
                focus:outline-none focus:ring-1 focus:ring-rc-accent-ring
                ${config.textColor}
              `}
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${
                  isExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Details */}
      {(isExpanded || !compact) && (
        <div className="px-3 pb-3 border-t border-rc-line/12">
          <p className={`font-rc-sans text-xs ${config.textColor} mt-2`}>
            {config.description}
          </p>

          {lastError && connectionState === "failed" && (
            <div className="rc-alert mt-2 p-2 text-xs" data-tone="danger">
              <strong>Error:</strong> {lastError}
            </div>
          )}

          {/* Additional status info */}
          <div className="rc-hint mt-2 flex items-center gap-4">
            <span>Status: {connectionState}</span>
            <span>•</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};
