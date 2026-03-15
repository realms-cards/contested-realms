/**
 * Media Controls Panel Component
 * Provides microphone, camera, and device selection controls for WebRTC
 */

import React, { useState } from 'react';
import { FEATURE_AUDIO_ONLY } from '@/lib/flags';
import { DeviceSelectionMenu } from './DeviceSelectionMenu';
import { PermissionRequestDialog } from './PermissionRequestDialog';
import type { MediaControlsPanelProps } from '@/lib/rtc/types';

export const MediaControlsPanel: React.FC<MediaControlsPanelProps> = ({
  rtcState,
  compact = false,
  showDeviceSettings = true,
  className = ''
}) => {
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  // Check if we need to show permission dialog
  const needsPermissions = !rtcState.permissionsGranted && rtcState.devicePermissionStatus === 'denied';

  const handleMicrophoneToggle = () => {
    if (!rtcState.permissionsGranted) {
      setShowPermissionDialog(true);
      return;
    }
    rtcState.toggleMicrophone();
  };

  const handleCameraToggle = () => {
    if (FEATURE_AUDIO_ONLY) return; // camera disabled in audio-only mode
    if (!rtcState.permissionsGranted) {
      setShowPermissionDialog(true);
      return;
    }
    rtcState.toggleCamera();
  };

  const handleDeviceSettingsClick = () => {
    if (!rtcState.permissionsGranted) {
      setShowPermissionDialog(true);
      return;
    }
    setShowDeviceMenu(true);
  };

  const handleRequestPermissions = async () => {
    await rtcState.requestPermissions();
    setShowPermissionDialog(false);
  };

  // Compact layout for overlay mode
  if (compact) {
    return (
      <div className={`
        flex items-center gap-2 
        bg-gray-900/80 backdrop-blur-sm
        rounded-full px-3 py-2
        ${className}
      `}>
        {/* Microphone Toggle */}
        <button
          onClick={handleMicrophoneToggle}
          className={`
            p-2 rounded-full transition-colors duration-200
            ${rtcState.microphoneMuted || needsPermissions
              ? 'bg-red-500/80 hover:bg-red-600/80 text-white'
              : 'bg-gray-700/80 hover:bg-gray-600/80 text-white'
            }
          `}
          title={rtcState.microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {rtcState.microphoneMuted || needsPermissions ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12A4.5 4.5 0 0014.64 7.64L13.41 8.87A3 3 0 0115 11.24V12a3 3 0 01-4.5 2.6L9 16.1A4.44 4.44 0 0012 17a4.5 4.5 0 004.5-5zM20 12a8 8 0 01-2.3 5.7l-1.4-1.4A6 6 0 0018 12a6 6 0 00-1.7-4.3l1.4-1.4A8 8 0 0120 12zM1 1l22 22-1.4 1.4L3.6 2.4 1 1zm10.5 9.5L7.48 6.48A3 3 0 0112 5a3 3 0 013 3v4a3 3 0 01-.18.97L11.5 10.5z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z"/>
              <path d="M19 10v2a7 7 0 11-14 0v-2"/>
              <path d="M12 19v4M8 23h8"/>
            </svg>
          )}
        </button>

        {/* Camera Toggle (hidden in audio-only mode) */}
        {!FEATURE_AUDIO_ONLY && (
          <button
            onClick={handleCameraToggle}
            className={`
              p-2 rounded-full transition-colors duration-200
              ${rtcState.cameraDisabled || needsPermissions
                ? 'bg-red-500/80 hover:bg-red-600/80 text-white'
                : 'bg-gray-700/80 hover:bg-gray-600/80 text-white'
              }
            `}
            title={rtcState.cameraDisabled ? 'Enable camera' : 'Disable camera'}
          >
            {rtcState.cameraDisabled || needsPermissions ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 6.5l-4 4V7a1 1 0 00-1-1H9.5l3-3H16a1 1 0 011 1v2.5zM1 1l22 22-1.4 1.4L19 20.8A1 1 0 0118 21H4a1 1 0 01-1-1V8a1 1 0 01.8-1L1.6 4.4 1 1zm4.5 9L4 8.5V19h12l-3-3H4.5z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            )}
          </button>
        )}

        {/* Device Settings */}
        {showDeviceSettings && (
          <button
            onClick={handleDeviceSettingsClick}
            className="
              p-2 rounded-full transition-colors duration-200
              bg-gray-700/80 hover:bg-gray-600/80 text-white
            "
            title="Device settings"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </button>
        )}

        {/* Device Selection Menu */}
        <DeviceSelectionMenu
          audioDevices={rtcState.audioDevices}
          videoDevices={FEATURE_AUDIO_ONLY ? [] : rtcState.videoDevices}
          selectedAudioId={rtcState.selectedAudioDeviceId}
          selectedVideoId={FEATURE_AUDIO_ONLY ? null : rtcState.selectedVideoDeviceId}
          onAudioDeviceChange={rtcState.setAudioDevice}
          onVideoDeviceChange={FEATURE_AUDIO_ONLY ? () => {} : rtcState.setVideoDevice}
          onRefreshDevices={rtcState.refreshDevices}
          isOpen={showDeviceMenu}
          onClose={() => setShowDeviceMenu(false)}
        />

        {/* Permission Request Dialog */}
        <PermissionRequestDialog
          isOpen={showPermissionDialog}
          onRequestPermissions={handleRequestPermissions}
          onCancel={() => setShowPermissionDialog(false)}
          permissionType="both"
        />
      </div>
    );
  }

  // Full layout for settings pages
  return (
    <div className={`
      bg-white border border-gray-200 rounded-lg shadow-sm p-4
      ${className}
    `}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Camera & Microphone
          </h3>
          
          {/* Connection Status */}
          <div className="flex items-center gap-2 text-sm">
            <div className={`
              w-2 h-2 rounded-full
              ${rtcState.connectionState === 'connected' ? 'bg-green-500' : 
                rtcState.connectionState === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}
            `} />
            <span className="text-gray-600 capitalize">
              {rtcState.connectionState}
            </span>
          </div>
        </div>

        {/* Permission Warning */}
        {needsPermissions && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 16h-1v-4h1m0-4h.01M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/>
              </svg>
              <p className="text-sm text-yellow-800">
                Camera and microphone access is required for video chat.
              </p>
            </div>
            <button
              onClick={handleRequestPermissions}
              className="mt-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-md transition-colors duration-200"
            >
              Grant Permissions
            </button>
          </div>
        )}

        {/* Media Controls */}
        <div className="grid grid-cols-2 gap-4">
          {/* Microphone Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Microphone
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMicrophoneToggle}
                disabled={!rtcState.permissionsGranted}
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full
                  transition-colors duration-200 disabled:opacity-50
                  ${rtcState.microphoneMuted
                    ? 'bg-red-100 hover:bg-red-200 text-red-600'
                    : 'bg-green-100 hover:bg-green-200 text-green-600'
                  }
                `}
                title={rtcState.microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {rtcState.microphoneMuted ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12A4.5 4.5 0 0014.64 7.64L13.41 8.87A3 3 0 0115 11.24V12a3 3 0 01-4.5 2.6L9 16.1A4.44 4.44 0 0012 17a4.5 4.5 0 004.5-5zM20 12a8 8 0 01-2.3 5.7l-1.4-1.4A6 6 0 0018 12a6 6 0 00-1.7-4.3l1.4-1.4A8 8 0 0120 12zM1 1l22 22-1.4 1.4L3.6 2.4 1 1zm10.5 9.5L7.48 6.48A3 3 0 0112 5a3 3 0 013 3v4a3 3 0 01-.18.97L11.5 10.5z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z"/>
                    <path d="M19 10v2a7 7 0 11-14 0v-2"/>
                    <path d="M12 19v4M8 23h8"/>
                  </svg>
                )}
              </button>
              <span className="text-sm text-gray-600">
                {rtcState.microphoneMuted ? 'Muted' : 'Active'}
              </span>
            </div>
          </div>

          {/* Camera Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Camera
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCameraToggle}
                disabled={!rtcState.permissionsGranted}
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full
                  transition-colors duration-200 disabled:opacity-50
                  ${rtcState.cameraDisabled
                    ? 'bg-red-100 hover:bg-red-200 text-red-600'
                    : 'bg-green-100 hover:bg-green-200 text-green-600'
                  }
                `}
                title={rtcState.cameraDisabled ? 'Enable camera' : 'Disable camera'}
              >
                {rtcState.cameraDisabled ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 6.5l-4 4V7a1 1 0 00-1-1H9.5l3-3H16a1 1 0 011 1v2.5zM1 1l22 22-1.4 1.4L19 20.8A1 1 0 0118 21H4a1 1 0 01-1-1V8a1 1 0 01.8-1L1.6 4.4 1 1zm4.5 9L4 8.5V19h12l-3-3H4.5z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                )}
              </button>
              <span className="text-sm text-gray-600">
                {rtcState.cameraDisabled ? 'Disabled' : 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Device Settings */}
        {showDeviceSettings && rtcState.permissionsGranted && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={handleDeviceSettingsClick}
              className="
                flex items-center gap-2 px-3 py-2
                text-sm text-gray-700 hover:text-gray-900
                hover:bg-gray-50 rounded-md
                transition-colors duration-200
              "
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Advanced Device Settings
            </button>
          </div>
        )}
      </div>

      {/* Device Selection Menu */}
      <DeviceSelectionMenu
        audioDevices={rtcState.audioDevices}
        videoDevices={FEATURE_AUDIO_ONLY ? [] : rtcState.videoDevices}
        selectedAudioId={rtcState.selectedAudioDeviceId}
        selectedVideoId={FEATURE_AUDIO_ONLY ? null : rtcState.selectedVideoDeviceId}
        onAudioDeviceChange={rtcState.setAudioDevice}
        onVideoDeviceChange={FEATURE_AUDIO_ONLY ? () => {} : rtcState.setVideoDevice}
        onRefreshDevices={rtcState.refreshDevices}
        isOpen={showDeviceMenu}
        onClose={() => setShowDeviceMenu(false)}
      />

      {/* Permission Request Dialog */}
      <PermissionRequestDialog
        isOpen={showPermissionDialog}
        onRequestPermissions={handleRequestPermissions}
        onCancel={() => setShowPermissionDialog(false)}
        permissionType={FEATURE_AUDIO_ONLY ? 'microphone' : 'both'}
      />
    </div>
  );
};
