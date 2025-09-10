/**
 * WebRTC Device Enumeration and Selection Logic
 * 
 * Comprehensive media device management with advanced constraint handling and device selection.
 * Provides a high-level interface for WebRTC device operations with automatic state management.
 * 
 * Features:
 * - Automatic device enumeration with caching and refresh logic
 * - Advanced constraint building with device-specific capabilities
 * - Real-time device monitoring with change detection
 * - Smart device selection with default device detection
 * - Constraint validation and testing before stream creation
 * - Enhanced device information with capabilities when available
 * 
 * Usage:
 * ```typescript
 * // Create device manager with state notifications
 * const deviceManager = new MediaDeviceManager((state) => {
 *   console.log('Device state updated:', state.audioDevices.length, 'audio devices');
 * });
 * 
 * // Enumerate available devices
 * const state = await deviceManager.enumerateDevices();
 * console.log('Found devices:', state.audioDevices, state.videoDevices);
 * 
 * // Select specific devices
 * deviceManager.selectAudioDevice(state.audioDevices[0].deviceId);
 * deviceManager.selectVideoDevice(state.videoDevices[0].deviceId);
 * 
 * // Get media stream with selected devices and constraints
 * const stream = await deviceManager.getMediaStream({
 *   audio: true,
 *   video: true
 * });
 * 
 * // Test custom constraints before using them
 * const testResult = await deviceManager.testConstraints({
 *   video: { width: 1920, height: 1080, frameRate: 60 }
 * });
 * if (!testResult.success) {
 *   console.log('Constraints not supported:', testResult.error);
 * }
 * 
 * // Monitor device changes
 * const stopMonitoring = deviceManager.startDeviceMonitoring();
 * // Later: stopMonitoring();
 * ```
 * 
 * Device Capabilities:
 * - Automatic detection of device capabilities when supported
 * - Constraint validation against device capabilities
 * - Smart fallbacks for unsupported constraints
 * - Enhanced device information with user-friendly names
 * 
 * Performance Considerations:
 * - Device enumeration is cached for 5 seconds to reduce API calls
 * - Capabilities are fetched asynchronously and cached
 * - Stream testing uses minimal constraints and immediate cleanup
 * - Device monitoring uses efficient event-driven updates
 */

export interface MediaDeviceWithCapabilities extends MediaDeviceInfo {
  capabilities?: MediaTrackCapabilities;
  isDefault?: boolean;
  isSelected?: boolean;
}

export interface DeviceConstraints {
  deviceId?: string;
  width?: number | { min?: number; max?: number; ideal?: number };
  height?: number | { min?: number; max?: number; ideal?: number };
  frameRate?: number | { min?: number; max?: number; ideal?: number };
  facingMode?: 'user' | 'environment';
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
}

export interface DeviceSelectionState {
  audioDevices: MediaDeviceWithCapabilities[];
  videoDevices: MediaDeviceWithCapabilities[];
  selectedAudioId: string | null;
  selectedVideoId: string | null;
  audioConstraints: DeviceConstraints;
  videoConstraints: DeviceConstraints;
  lastEnumeration: number;
  hasPermissions: boolean;
}

export class MediaDeviceManager {
  private state: DeviceSelectionState = {
    audioDevices: [],
    videoDevices: [],
    selectedAudioId: null,
    selectedVideoId: null,
    audioConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    videoConstraints: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 }
    },
    lastEnumeration: 0,
    hasPermissions: false
  };

  private onStateChange?: (state: DeviceSelectionState) => void;

  constructor(onStateChange?: (state: DeviceSelectionState) => void) {
    this.onStateChange = onStateChange;
  }

  /**
   * Get current device state
   */
  getState(): DeviceSelectionState {
    return { ...this.state };
  }

  /**
   * Enumerate available media devices
   */
  async enumerateDevices(forceRefresh = false): Promise<DeviceSelectionState> {
    const now = Date.now();
    
    // Skip if recently enumerated and not forcing
    if (!forceRefresh && (now - this.state.lastEnumeration) < 5000) {
      return this.getState();
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some(device => device.label !== '');
      
      // Separate device types
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');

      // Enhance devices with additional info
      const enhancedAudioDevices = await Promise.all(
        audioInputs.map(device => this.enhanceAudioDevice(device))
      );
      
      const enhancedVideoDevices = await Promise.all(
        videoInputs.map(device => this.enhanceVideoDevice(device))
      );

      // Update state
      this.state = {
        ...this.state,
        audioDevices: enhancedAudioDevices,
        videoDevices: enhancedVideoDevices,
        lastEnumeration: now,
        hasPermissions: hasLabels
      };

      // Auto-select default devices if none selected
      if (!this.state.selectedAudioId && enhancedAudioDevices.length > 0) {
        this.state.selectedAudioId = this.findDefaultDevice(enhancedAudioDevices)?.deviceId || 
                                     enhancedAudioDevices[0].deviceId;
      }

      if (!this.state.selectedVideoId && enhancedVideoDevices.length > 0) {
        this.state.selectedVideoId = this.findDefaultDevice(enhancedVideoDevices)?.deviceId || 
                                     enhancedVideoDevices[0].deviceId;
      }

      this.notifyStateChange();
      return this.getState();

    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      throw new Error('Failed to access media devices');
    }
  }

  /**
   * Select audio input device
   */
  selectAudioDevice(deviceId: string | null): void {
    if (deviceId && !this.state.audioDevices.find(d => d.deviceId === deviceId)) {
      throw new Error('Audio device not found');
    }
    
    this.state.selectedAudioId = deviceId;
    this.notifyStateChange();
  }

  /**
   * Select video input device
   */
  selectVideoDevice(deviceId: string | null): void {
    if (deviceId && !this.state.videoDevices.find(d => d.deviceId === deviceId)) {
      throw new Error('Video device not found');
    }
    
    this.state.selectedVideoId = deviceId;
    this.notifyStateChange();
  }

  /**
   * Update audio constraints
   */
  updateAudioConstraints(constraints: Partial<DeviceConstraints>): void {
    this.state.audioConstraints = {
      ...this.state.audioConstraints,
      ...constraints
    };
    this.notifyStateChange();
  }

  /**
   * Update video constraints
   */
  updateVideoConstraints(constraints: Partial<DeviceConstraints>): void {
    this.state.videoConstraints = {
      ...this.state.videoConstraints,
      ...constraints
    };
    this.notifyStateChange();
  }

  /**
   * Get media stream with current selections
   */
  async getMediaStream(options: {
    audio?: boolean;
    video?: boolean;
    audioConstraints?: DeviceConstraints;
    videoConstraints?: DeviceConstraints;
  } = {}): Promise<MediaStream> {
    const {
      audio = true,
      video = true,
      audioConstraints = this.state.audioConstraints,
      videoConstraints = this.state.videoConstraints
    } = options;

    const constraints: MediaStreamConstraints = {};

    if (audio) {
      constraints.audio = this.buildAudioConstraints(audioConstraints);
    }

    if (video) {
      constraints.video = this.buildVideoConstraints(videoConstraints);
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw this.handleGetUserMediaError(error);
    }
  }

  /**
   * Test if device constraints are supported
   */
  async testConstraints(constraints: MediaStreamConstraints): Promise<{
    success: boolean;
    error?: string;
    supportedConstraints?: MediaTrackSupportedConstraints;
  }> {
    try {
      // Check supported constraints
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
      
      // Try to get media with constraints
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Clean up test stream
      stream.getTracks().forEach(track => track.stop());
      
      return {
        success: true,
        supportedConstraints
      };
    } catch (error) {
      let errorMessage = 'Constraints not supported';
      
      if (error instanceof Error) {
        if (error.name === 'OverconstrainedError') {
          errorMessage = 'Device constraints cannot be satisfied';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No device matches the constraints';
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get device capabilities if supported
   */
  async getDeviceCapabilities(deviceId: string, kind: 'audioinput' | 'videoinput'): Promise<MediaTrackCapabilities | null> {
    try {
      // Create a temporary stream to get capabilities
      const constraints: MediaStreamConstraints = {};
      
      if (kind === 'audioinput') {
        constraints.audio = { deviceId: { exact: deviceId } };
      } else {
        constraints.video = { deviceId: { exact: deviceId } };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const tracks = kind === 'audioinput' ? stream.getAudioTracks() : stream.getVideoTracks();
      
      let capabilities: MediaTrackCapabilities | null = null;
      
      if (tracks.length > 0 && 'getCapabilities' in tracks[0]) {
        capabilities = tracks[0].getCapabilities();
      }
      
      // Clean up
      stream.getTracks().forEach(track => track.stop());
      
      return capabilities;
    } catch (error) {
      console.warn(`Failed to get capabilities for ${kind} device ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Monitor device changes
   */
  startDeviceMonitoring(): () => void {
    const handleDeviceChange = () => {
      // Re-enumerate devices when changes detected
      this.enumerateDevices(true).catch(error => {
        console.error('Device change enumeration failed:', error);
      });
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }

  private async enhanceAudioDevice(device: MediaDeviceInfo): Promise<MediaDeviceWithCapabilities> {
    const enhanced: MediaDeviceWithCapabilities = {
      ...device,
      isDefault: device.deviceId === 'default',
      isSelected: device.deviceId === this.state.selectedAudioId
    };

    try {
      enhanced.capabilities = await this.getDeviceCapabilities(device.deviceId, 'audioinput') || undefined;
    } catch {
      // Capabilities not available
    }

    return enhanced;
  }

  private async enhanceVideoDevice(device: MediaDeviceInfo): Promise<MediaDeviceWithCapabilities> {
    const enhanced: MediaDeviceWithCapabilities = {
      ...device,
      isDefault: device.deviceId === 'default',
      isSelected: device.deviceId === this.state.selectedVideoId
    };

    try {
      enhanced.capabilities = await this.getDeviceCapabilities(device.deviceId, 'videoinput') || undefined;
    } catch {
      // Capabilities not available
    }

    return enhanced;
  }

  private findDefaultDevice(devices: MediaDeviceInfo[]): MediaDeviceInfo | null {
    // Look for device marked as default
    const defaultDevice = devices.find(device => device.deviceId === 'default');
    if (defaultDevice) return defaultDevice;
    
    // Look for device with "Default" in label
    const labelDefaultDevice = devices.find(device => 
      device.label.toLowerCase().includes('default')
    );
    if (labelDefaultDevice) return labelDefaultDevice;
    
    return null;
  }

  private buildAudioConstraints(constraints: DeviceConstraints): MediaTrackConstraints {
    const audioConstraints: MediaTrackConstraints = {};
    
    if (this.state.selectedAudioId) {
      audioConstraints.deviceId = { exact: this.state.selectedAudioId };
    }
    
    if (constraints.echoCancellation !== undefined) {
      audioConstraints.echoCancellation = constraints.echoCancellation;
    }
    
    if (constraints.noiseSuppression !== undefined) {
      audioConstraints.noiseSuppression = constraints.noiseSuppression;
    }
    
    if (constraints.autoGainControl !== undefined) {
      audioConstraints.autoGainControl = constraints.autoGainControl;
    }
    
    if (constraints.sampleRate !== undefined) {
      audioConstraints.sampleRate = constraints.sampleRate;
    }
    
    if (constraints.sampleSize !== undefined) {
      audioConstraints.sampleSize = constraints.sampleSize;
    }
    
    if (constraints.channelCount !== undefined) {
      audioConstraints.channelCount = constraints.channelCount;
    }
    
    return audioConstraints;
  }

  private buildVideoConstraints(constraints: DeviceConstraints): MediaTrackConstraints {
    const videoConstraints: MediaTrackConstraints = {};
    
    if (this.state.selectedVideoId) {
      videoConstraints.deviceId = { exact: this.state.selectedVideoId };
    }
    
    if (constraints.width !== undefined) {
      videoConstraints.width = constraints.width;
    }
    
    if (constraints.height !== undefined) {
      videoConstraints.height = constraints.height;
    }
    
    if (constraints.frameRate !== undefined) {
      videoConstraints.frameRate = constraints.frameRate;
    }
    
    if (constraints.facingMode !== undefined) {
      videoConstraints.facingMode = constraints.facingMode;
    }
    
    return videoConstraints;
  }

  private handleGetUserMediaError(error: unknown): Error {
    if (error instanceof Error) {
      switch (error.name) {
        case 'NotAllowedError':
          return new Error('Permission denied. Please allow camera and microphone access.');
        case 'NotFoundError':
          return new Error('No camera or microphone found on this device.');
        case 'NotReadableError':
          return new Error('Camera or microphone is already in use by another application.');
        case 'OverconstrainedError':
          return new Error('The requested media constraints cannot be satisfied.');
        case 'SecurityError':
          return new Error('Media access blocked due to security restrictions.');
        case 'AbortError':
          return new Error('Media access request was aborted.');
        default:
          return new Error(`Media access failed: ${error.message}`);
      }
    }
    return new Error('Unknown media access error');
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}

/**
 * Utility functions for device management
 */

/**
 * Get device display name with fallbacks
 */
export function getDeviceDisplayName(device: MediaDeviceInfo): string {
  if (device.label) {
    return device.label;
  }
  
  // Fallback names based on device type
  if (device.kind === 'audioinput') {
    return `Microphone ${device.deviceId.slice(0, 8)}`;
  } else if (device.kind === 'videoinput') {
    return `Camera ${device.deviceId.slice(0, 8)}`;
  }
  
  return `Device ${device.deviceId.slice(0, 8)}`;
}

/**
 * Group devices by type for display
 */
export function groupDevicesByType(devices: MediaDeviceInfo[]): {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
} {
  return {
    audioInputs: devices.filter(d => d.kind === 'audioinput'),
    videoInputs: devices.filter(d => d.kind === 'videoinput'),
    audioOutputs: devices.filter(d => d.kind === 'audiooutput')
  };
}

/**
 * Check if device supports specific constraints
 */
export function deviceSupportsConstraints(
  capabilities: MediaTrackCapabilities,
  constraints: DeviceConstraints
): boolean {
  // Check video resolution constraints
  if (constraints.width && capabilities.width) {
    const width = typeof constraints.width === 'number' ? constraints.width : constraints.width.ideal || constraints.width.max || 0;
    if (capabilities.width.max !== undefined && capabilities.width.min !== undefined) {
      if (width > capabilities.width.max || width < capabilities.width.min) {
        return false;
      }
    }
  }
  
  if (constraints.height && capabilities.height) {
    const height = typeof constraints.height === 'number' ? constraints.height : constraints.height.ideal || constraints.height.max || 0;
    if (capabilities.height.max !== undefined && capabilities.height.min !== undefined) {
      if (height > capabilities.height.max || height < capabilities.height.min) {
        return false;
      }
    }
  }
  
  // Check frame rate constraints
  if (constraints.frameRate && capabilities.frameRate) {
    const frameRate = typeof constraints.frameRate === 'number' ? constraints.frameRate : constraints.frameRate.ideal || constraints.frameRate.max || 0;
    if (capabilities.frameRate.max !== undefined && capabilities.frameRate.min !== undefined) {
      if (frameRate > capabilities.frameRate.max || frameRate < capabilities.frameRate.min) {
        return false;
      }
    }
  }
  
  return true;
}