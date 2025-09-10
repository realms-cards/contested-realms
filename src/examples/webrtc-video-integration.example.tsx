/**
 * WebRTC Video Integration Usage Examples
 * 
 * Complete examples showing how to integrate the WebRTC video system
 * into different parts of the application.
 */

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { VideoOverlayProvider, useVideoOverlay } from '@/lib/contexts/VideoOverlayContext';
import { GlobalVideoOverlay } from '@/components/ui/GlobalVideoOverlay';
import { SeatVideo3D, LegacySeatVideo3D } from '@/lib/rtc/SeatVideo3D';
import { useGlobalWebRTC } from '@/lib/hooks/useGlobalWebRTC';
import { checkPermissionStatus, requestMediaPermissions } from '@/lib/utils/webrtc-permissions';
import { MediaDeviceManager } from '@/lib/utils/webrtc-devices';

/**
 * Example 1: Basic Video Overlay Setup
 * 
 * Shows how to set up the video overlay system in your app root.
 * This provides screen-aware video controls throughout your application.
 */
export function BasicVideoOverlayExample() {
  return (
    <VideoOverlayProvider initialScreenType="lobby">
      <div className="app-container">
        {/* Your app content */}
        <main>
          <h1>My Game Application</h1>
          <p>Video overlay will appear when WebRTC is active</p>
        </main>
        
        {/* Global video overlay - automatically adapts to screen type */}
        <GlobalVideoOverlay 
          position="top-right" 
          showUserAvatar={true}
        />
      </div>
    </VideoOverlayProvider>
  );
}

/**
 * Example 2: Screen Type Management
 * 
 * Shows how different screens control video overlay behavior.
 */
export function ScreenTypeExample() {
  const { updateScreenType, overlayConfig } = useVideoOverlay();
  
  // Update screen type based on current route/state
  useEffect(() => {
    // Example: Update based on current screen
    const currentScreen = getCurrentScreen(); // Your routing logic
    
    switch (currentScreen) {
      case 'lobby':
        updateScreenType('lobby'); // Full video + controls
        break;
      case 'draft':
        updateScreenType('draft'); // Audio only
        break;
      case 'game':
        updateScreenType('game-3d'); // 3D positioned video
        break;
      case 'deck-builder':
        updateScreenType('deck-editor'); // Audio only
        break;
      default:
        updateScreenType('lobby');
    }
  }, [updateScreenType]);
  
  return (
    <div className="screen-container">
      <h2>Current Screen Configuration</h2>
      <div className="screen-info">
        <p>Screen Type: {overlayConfig.screenType}</p>
        <p>Show Video: {overlayConfig.showVideo ? 'Yes' : 'No'}</p>
        <p>Audio Only: {overlayConfig.audioOnly ? 'Yes' : 'No'}</p>
        <p>Show Controls: {overlayConfig.showControls ? 'Yes' : 'No'}</p>
      </div>
    </div>
  );
}

function getCurrentScreen(): string {
  // Your routing/screen detection logic
  return 'lobby';
}

/**
 * Example 3: 3D Video Integration
 * 
 * Shows how to place video streams at specific 3D positions for game scenes.
 */
export function Video3DExample() {
  const [webrtcStreams, setWebrtcStreams] = useState<{
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remotePeerId: string | null;
  }>({
    localStream: null,
    remoteStream: null,
    remotePeerId: null
  });
  
  // Example WebRTC state - replace with your actual WebRTC hook
  const rtcState = useGlobalWebRTC({
    enabled: true,
    transport: null, // Your transport
    myPlayerId: 'player1',
    matchId: 'match123'
  });
  
  useEffect(() => {
    setWebrtcStreams({
      localStream: rtcState.localStream,
      remoteStream: rtcState.remoteStream,
      remotePeerId: rtcState.remotePeerId
    });
  }, [rtcState.localStream, rtcState.remoteStream, rtcState.remotePeerId]);
  
  return (
    <Canvas style={{ width: '100vw', height: '100vh' }}>
      {/* Your 3D scene content */}
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} />
      
      {/* Game board or other 3D objects */}
      <mesh>
        <boxGeometry args={[2, 0.1, 3]} />
        <meshStandardMaterial color="green" />
      </mesh>
      
      {/* 3D Video Streams */}
      {webrtcStreams.remoteStream && (
        <SeatVideo3D
          playerId={webrtcStreams.remotePeerId || 'remote-player'}
          stream={webrtcStreams.remoteStream}
          position={new THREE.Vector3(2, 0.5, 2)} // Right side of board
          rotation={Math.PI} // Face toward center
          width={1.2}
          height={0.9}
          visible={true}
        />
      )}
      
      {webrtcStreams.localStream && (
        <SeatVideo3D
          playerId="player1"
          stream={webrtcStreams.localStream}
          position={new THREE.Vector3(-2, 0.5, 2)} // Left side of board
          rotation={0} // Face toward center
          width={1.2}
          height={0.9}
          visible={true}
        />
      )}
    </Canvas>
  );
}

/**
 * Example 4: Legacy Integration Pattern
 * 
 * Shows how to use the legacy wrapper for existing game store integration.
 */
export function LegacyVideo3DExample() {
  const [streams, setStreams] = useState<{
    p1Stream: MediaStream | null;
    p2Stream: MediaStream | null;
  }>({
    p1Stream: null,
    p2Stream: null
  });
  
  // Your existing stream management logic
  useEffect(() => {
    // Connect to your existing WebRTC system
    const connectStreams = async () => {
      // Example stream setup - replace with your logic
      const localStream = await getUserMedia();
      const remoteStream = await getRemoteStream();
      
      setStreams({
        p1Stream: localStream,
        p2Stream: remoteStream
      });
    };
    
    connectStreams();
  }, []);
  
  return (
    <Canvas>
      {/* Your existing 3D game scene */}
      <ambientLight intensity={0.5} />
      
      {/* Legacy video integration - uses game store for positioning */}
      <LegacySeatVideo3D
        who="p1"
        stream={streams.p1Stream}
        width={1.0}
        height={0.75}
      />
      
      <LegacySeatVideo3D
        who="p2"
        stream={streams.p2Stream}
        width={1.0}
        height={0.75}
      />
    </Canvas>
  );
}

// Mock functions for examples - replace with your actual implementations
async function getUserMedia(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (error) {
    console.error('Failed to get user media:', error);
    return null;
  }
}

async function getRemoteStream(): Promise<MediaStream | null> {
  // Your WebRTC peer connection logic
  return null;
}

/**
 * Example 5: Permission Management Integration
 * 
 * Shows how to handle permissions before starting video.
 */
export function PermissionExample() {
  const [permissionStatus, setPermissionStatus] = useState<{
    camera: string;
    microphone: string;
    overall: string;
  } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  useEffect(() => {
    // Check permissions on component mount
    checkPermissions();
  }, []);
  
  const checkPermissions = async () => {
    try {
      const status = await checkPermissionStatus();
      setPermissionStatus(status);
    } catch (error) {
      console.error('Permission check failed:', error);
    }
  };
  
  const requestPermissions = async () => {
    try {
      const result = await requestMediaPermissions({
        video: true,
        audio: true
      });
      
      if (result.success && result.stream) {
        setStream(result.stream);
        await checkPermissions(); // Refresh status
      } else {
        alert(result.error || 'Failed to get permissions');
      }
    } catch (error) {
      console.error('Permission request failed:', error);
    }
  };
  
  return (
    <div className="permission-example">
      <h3>Camera & Microphone Permissions</h3>
      
      {permissionStatus && (
        <div className="permission-status">
          <p>Camera: {permissionStatus.camera}</p>
          <p>Microphone: {permissionStatus.microphone}</p>
          <p>Overall: {permissionStatus.overall}</p>
        </div>
      )}
      
      {permissionStatus?.overall !== 'granted' && (
        <button onClick={requestPermissions} className="btn-primary">
          Request Camera & Microphone Access
        </button>
      )}
      
      {stream && (
        <div className="stream-preview">
          <video
            ref={(video) => {
              if (video && stream) {
                video.srcObject = stream;
              }
            }}
            autoPlay
            muted
            playsInline
            className="w-64 h-48 rounded-lg"
          />
          <p>✅ Permissions granted and stream active</p>
        </div>
      )}
    </div>
  );
}

/**
 * Example 6: Device Management Integration
 * 
 * Shows how to use the device manager for device selection.
 */
export function DeviceManagementExample() {
  const [deviceManager] = useState(() => new MediaDeviceManager());
  const [deviceState, setDeviceState] = useState(deviceManager.getState());
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  useEffect(() => {
    // Set up device state monitoring
    const manager = new MediaDeviceManager((newState) => {
      setDeviceState(newState);
    });
    
    // Initial device enumeration
    manager.enumerateDevices().catch(console.error);
    
    // Monitor device changes
    const stopMonitoring = manager.startDeviceMonitoring();
    
    return () => {
      stopMonitoring();
    };
  }, []);
  
  const handleDeviceSelect = async (deviceId: string, type: 'audio' | 'video') => {
    if (type === 'audio') {
      deviceManager.selectAudioDevice(deviceId);
    } else {
      deviceManager.selectVideoDevice(deviceId);
    }
    
    // Get new stream with selected devices
    try {
      const newStream = await deviceManager.getMediaStream({
        audio: true,
        video: true
      });
      
      // Stop old stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      setStream(newStream);
    } catch (error) {
      console.error('Failed to get stream with new device:', error);
    }
  };
  
  return (
    <div className="device-management-example">
      <h3>Device Selection</h3>
      
      <div className="device-selectors">
        <div className="audio-devices">
          <h4>Microphones</h4>
          <select 
            value={deviceState.selectedAudioId || ''}
            onChange={(e) => handleDeviceSelect(e.target.value, 'audio')}
          >
            <option value="">Select microphone...</option>
            {deviceState.audioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
        
        <div className="video-devices">
          <h4>Cameras</h4>
          <select 
            value={deviceState.selectedVideoId || ''}
            onChange={(e) => handleDeviceSelect(e.target.value, 'video')}
          >
            <option value="">Select camera...</option>
            {deviceState.videoDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {stream && (
        <video
          ref={(video) => {
            if (video && stream) {
              video.srcObject = stream;
            }
          }}
          autoPlay
          muted
          playsInline
          className="w-64 h-48 mt-4 rounded-lg"
        />
      )}
      
      <div className="device-info">
        <p>Audio devices found: {deviceState.audioDevices.length}</p>
        <p>Video devices found: {deviceState.videoDevices.length}</p>
        <p>Permissions granted: {deviceState.hasPermissions ? 'Yes' : 'No'}</p>
      </div>
    </div>
  );
}

/**
 * Example 7: Complete Integration
 * 
 * Shows how all pieces work together in a complete application.
 */
export function CompleteIntegrationExample() {
  return (
    <VideoOverlayProvider initialScreenType="lobby">
      <div className="app">
        {/* Navigation */}
        <nav className="app-nav">
          <ScreenTypeExample />
        </nav>
        
        {/* Main content area */}
        <main className="app-main">
          <div className="game-area">
            <Video3DExample />
          </div>
          
          <div className="settings-panel">
            <PermissionExample />
            <DeviceManagementExample />
          </div>
        </main>
        
        {/* Global video overlay */}
        <GlobalVideoOverlay 
          position="top-right"
          showUserAvatar={true}
        />
      </div>
    </VideoOverlayProvider>
  );
}