/**
 * Permission Request Dialog Component
 * Modal dialog for requesting camera and microphone permissions
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PermissionRequestDialogProps } from "@/lib/rtc/types";

export const PermissionRequestDialog: React.FC<
  PermissionRequestDialogProps
> = ({ isOpen, onRequestPermissions, onCancel, permissionType }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      const focusableElement = dialogRef.current.querySelector(
        "button"
      ) as HTMLElement;
      focusableElement?.focus();
    }

    return undefined;
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      return () => document.removeEventListener("keydown", handleEscapeKey);
    }

    return undefined;
  }, [isOpen, onCancel]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "unset";
      };
    }

    return undefined;
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
              className="w-12 h-12 text-blue-600"
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
              className="w-12 h-12 text-blue-600"
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
              className="w-12 h-12 text-blue-600"
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

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
        {/* Dialog */}
        <div
          ref={dialogRef}
          className="
            bg-white rounded-lg shadow-xl
            w-full max-w-md min-w-[320px]
            max-h-[90vh] overflow-y-auto
            transform transition-all duration-200 ease-out
          "
          role="dialog"
          aria-labelledby="permission-dialog-title"
          aria-describedby="permission-dialog-description"
        >
          {/* Content */}
          <div className="p-6">
            {/* Icon */}
            <div className="flex items-center justify-center mb-4">{icon}</div>

            {/* Title */}
            <h3
              id="permission-dialog-title"
              className="text-lg font-medium text-gray-900 text-center mb-2"
            >
              {title}
            </h3>

            {/* Description */}
            <p
              id="permission-dialog-description"
              className="text-sm text-gray-600 text-center mb-6"
            >
              {description}
            </p>

            {/* Browser instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M13 16h-1v-4h1m0-4h.01M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">How to grant permissions:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Click &quot;Allow Permissions&quot; below</li>
                    <li>Your browser will show a permission prompt</li>
                    <li>
                      Click &quot;Allow&quot; or &quot;Permit&quot; to grant
                      access
                    </li>
                    <li>
                      If blocked, click the camera icon in your address bar
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="
                  flex-1 px-4 py-2
                  text-sm font-medium text-gray-700
                  bg-white border border-gray-300 rounded-md
                  hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500
                  transition-colors duration-200
                "
              >
                Cancel
              </button>
              <button
                onClick={onRequestPermissions}
                className="
                  flex-1 px-4 py-2
                  text-sm font-medium text-white
                  bg-blue-600 border border-transparent rounded-md
                  hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                  transition-colors duration-200
                "
              >
                Allow Permissions
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
