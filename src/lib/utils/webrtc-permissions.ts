/**
 * WebRTC Permission Management Utilities
 * 
 * Centralized permission checking and device access management for WebRTC applications.
 * Provides comprehensive permission handling with fallbacks for different browser capabilities.
 * 
 * Features:
 * - Browser compatibility detection for WebRTC and media devices
 * - Unified permission status checking across different APIs
 * - User-friendly error messages with specific guidance
 * - Permission monitoring with change detection
 * - Device enumeration with automatic permission requests
 * 
 * Usage:
 * ```typescript
 * // Check basic WebRTC support
 * const capabilities = checkWebRTCSupport();
 * if (!capabilities.supportsConstraints) {
 *   console.log('WebRTC not supported');
 * }
 * 
 * // Check current permission status
 * const status = await checkPermissionStatus();
 * if (status.overall === 'denied') {
 *   const message = getPermissionErrorMessage(status);
 *   alert(message);
 * }
 * 
 * // Request permissions and get stream
 * const result = await requestMediaPermissions({ video: true, audio: true });
 * if (result.success && result.stream) {
 *   videoElement.srcObject = result.stream;
 * }
 * 
 * // Monitor permission changes
 * const cleanup = monitorPermissionChanges((status) => {
 *   console.log('Permissions changed:', status);
 * });
 * // Later: cleanup();
 * ```
 * 
 * Browser Compatibility:
 * - Uses modern Permissions API when available
 * - Falls back to device enumeration for older browsers
 * - Provides meaningful error messages across all browsers
 * - Handles browser-specific quirks and limitations
 */

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'checking' | 'unsupported';

export interface DevicePermissionStatus {
  camera: PermissionState;
  microphone: PermissionState;
  overall: PermissionState;
}

export interface MediaDeviceCapabilities {
  hasCamera: boolean;
  hasMicrophone: boolean;
  hasDeviceSelection: boolean;
  supportsConstraints: boolean;
}

/**
 * Check if WebRTC and media devices are supported
 */
export function checkWebRTCSupport(): MediaDeviceCapabilities {
  const hasMediaDevices = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  const hasRTCPeerConnection = 'RTCPeerConnection' in window;
  const hasEnumerateDevices = hasMediaDevices && 'enumerateDevices' in navigator.mediaDevices;
  
  return {
    hasCamera: hasMediaDevices,
    hasMicrophone: hasMediaDevices,
    hasDeviceSelection: hasEnumerateDevices,
    supportsConstraints: hasMediaDevices && hasRTCPeerConnection
  };
}

/**
 * Check current permission status for camera and microphone
 */
export async function checkPermissionStatus(): Promise<DevicePermissionStatus> {
  const capabilities = checkWebRTCSupport();
  
  if (!capabilities.supportsConstraints) {
    return {
      camera: 'unsupported',
      microphone: 'unsupported',
      overall: 'unsupported'
    };
  }

  try {
    // Use Permissions API if available
    if ('permissions' in navigator) {
      const [cameraPermission, microphonePermission] = await Promise.all([
        navigator.permissions.query({ name: 'camera' as PermissionName }),
        navigator.permissions.query({ name: 'microphone' as PermissionName })
      ]);
      
      const camera: PermissionState = cameraPermission.state as PermissionState;
      const microphone: PermissionState = microphonePermission.state as PermissionState;
      
      // Overall permission is granted only if both are granted
      const overall: PermissionState = 
        camera === 'granted' && microphone === 'granted' ? 'granted' :
        camera === 'denied' || microphone === 'denied' ? 'denied' : 'prompt';
      
      return { camera, microphone, overall };
    }
    
    // Fallback: Try to access devices to check permissions
    try {
      if (typeof navigator !== 'undefined' && 'mediaDevices' in navigator) {
        const nav = navigator as Navigator & { mediaDevices: MediaDevices };
        if (nav.mediaDevices && 'enumerateDevices' in nav.mediaDevices) {
          const devices = await nav.mediaDevices.enumerateDevices();
          const hasLabels = devices.some((device: MediaDeviceInfo) => device.label !== '');
        
          if (hasLabels) {
            return {
              camera: 'granted',
              microphone: 'granted',
              overall: 'granted'
            };
          }
        }
      }
    } catch {
      // Enumerate devices failed, permissions likely denied
    }
    
    return {
      camera: 'prompt',
      microphone: 'prompt',
      overall: 'prompt'
    };
    
  } catch (error) {
    console.warn('Failed to check permissions:', error);
    return {
      camera: 'prompt',
      microphone: 'prompt',
      overall: 'prompt'
    };
  }
}

/**
 * Request camera and microphone permissions
 */
export async function requestMediaPermissions(options: {
  video?: boolean;
  audio?: boolean;
} = { video: true, audio: true }): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
  const capabilities = checkWebRTCSupport();
  
  if (!capabilities.supportsConstraints) {
    return {
      success: false,
      error: 'WebRTC not supported in this browser'
    };
  }

  try {
    const constraints: MediaStreamConstraints = {
      video: options.video,
      audio: options.audio
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    return {
      success: true,
      stream
    };
    
  } catch (error) {
    let errorMessage = 'Failed to access media devices';
    
    if (error instanceof Error) {
      switch (error.name) {
        case 'NotAllowedError':
          errorMessage = 'Permission denied. Please allow camera and microphone access.';
          break;
        case 'NotFoundError':
          errorMessage = 'No camera or microphone found on this device.';
          break;
        case 'NotReadableError':
          errorMessage = 'Camera or microphone is already in use by another application.';
          break;
        case 'OverconstrainedError':
          errorMessage = 'The requested media constraints cannot be satisfied.';
          break;
        case 'SecurityError':
          errorMessage = 'Media access blocked due to security restrictions.';
          break;
        case 'AbortError':
          errorMessage = 'Media access request was aborted.';
          break;
        default:
          errorMessage = `Media access failed: ${error.message}`;
      }
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Get available media devices with proper permission handling
 */
export async function getAvailableDevices(): Promise<{
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  hasPermissions: boolean;
  error?: string;
}> {
  const capabilities = checkWebRTCSupport();
  
  if (!capabilities.hasDeviceSelection) {
    return {
      audioInputs: [],
      videoInputs: [],
      hasPermissions: false,
      error: 'Device enumeration not supported'
    };
  }

  try {
    // First check if we already have permissions
    const permissionStatus = await checkPermissionStatus();
    let devices = await navigator.mediaDevices.enumerateDevices();
    
    // If we don't have permissions, device labels will be empty
    const hasLabels = devices.some(device => device.label !== '');
    
    if (!hasLabels && permissionStatus.overall !== 'denied') {
      // Try to get permissions first
      const permissionResult = await requestMediaPermissions();
      if (permissionResult.success) {
        // Clean up the permission-requesting stream
        if (permissionResult.stream) {
          permissionResult.stream.getTracks().forEach(track => track.stop());
        }
        
        // Re-enumerate devices now that we have permissions
        devices = await navigator.mediaDevices.enumerateDevices();
      }
    }
    
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    const hasPermissions = devices.some(device => device.label !== '');
    
    return {
      audioInputs,
      videoInputs,
      hasPermissions
    };
    
  } catch (error) {
    console.error('Failed to enumerate devices:', error);
    return {
      audioInputs: [],
      videoInputs: [],
      hasPermissions: false,
      error: error instanceof Error ? error.message : 'Failed to access devices'
    };
  }
}

/**
 * Test if specific device constraints can be satisfied
 */
export async function testDeviceConstraints(constraints: MediaStreamConstraints): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Clean up test stream
    stream.getTracks().forEach(track => track.stop());
    
    return { success: true };
    
  } catch (error) {
    let errorMessage = 'Device constraints cannot be satisfied';
    
    if (error instanceof Error) {
      switch (error.name) {
        case 'OverconstrainedError':
          errorMessage = 'The specified device or constraints are not available.';
          break;
        case 'NotFoundError':
          errorMessage = 'No devices match the specified constraints.';
          break;
        default:
          errorMessage = `Constraint test failed: ${error.message}`;
      }
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Monitor permission changes
 */
export function monitorPermissionChanges(
  callback: (status: DevicePermissionStatus) => void
): () => void {
  if (!('permissions' in navigator)) {
    // No permission monitoring available
    return () => {};
  }

  const controllers: AbortController[] = [];
  
  const monitorPermission = async (name: PermissionName) => {
    try {
      const permission = await navigator.permissions.query({ name });
      const controller = new AbortController();
      controllers.push(controller);
      
      permission.addEventListener('change', async () => {
        const status = await checkPermissionStatus();
        callback(status);
      }, { signal: controller.signal });
      
    } catch (error) {
      console.warn(`Failed to monitor ${name} permission:`, error);
    }
  };
  
  // Start monitoring both permissions
  monitorPermission('camera' as PermissionName);
  monitorPermission('microphone' as PermissionName);
  
  // Return cleanup function
  return () => {
    controllers.forEach(controller => controller.abort());
  };
}

/**
 * Get user-friendly permission error message
 */
export function getPermissionErrorMessage(
  status: DevicePermissionStatus,
  requestedFeatures: { video?: boolean; audio?: boolean } = { video: true, audio: true }
): string | null {
  if (status.overall === 'granted') {
    return null;
  }
  
  if (status.overall === 'unsupported') {
    return 'Your browser does not support camera and microphone access. Please use a modern browser like Chrome, Firefox, or Safari.';
  }
  
  if (status.overall === 'denied') {
    const deniedDevices: string[] = [];
    if (status.camera === 'denied' && requestedFeatures.video) {
      deniedDevices.push('camera');
    }
    if (status.microphone === 'denied' && requestedFeatures.audio) {
      deniedDevices.push('microphone');
    }
    
    if (deniedDevices.length > 0) {
      return `Access to ${deniedDevices.join(' and ')} has been blocked. Please click the camera icon in your browser's address bar and allow access.`;
    }
  }
  
  if (status.overall === 'prompt') {
    const promptDevices: string[] = [];
    if (requestedFeatures.video) promptDevices.push('camera');
    if (requestedFeatures.audio) promptDevices.push('microphone');
    
    return `Please allow access to your ${promptDevices.join(' and ')} to enable video chat.`;
  }
  
  return 'Unable to access camera or microphone. Please check your browser settings.';
}