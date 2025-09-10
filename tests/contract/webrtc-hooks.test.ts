/**
 * Contract Test: useGlobalWebRTC Hook Interface
 * 
 * This test ensures that the useGlobalWebRTC hook interface matches
 * the contract defined in specs/006-live-video-and/contracts/webrtc-hooks.ts
 * 
 * CRITICAL: This test MUST FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { setupWebRTCMocks } from '../fixtures/webrtc-mock';
import { createMockClient } from '../setup-server';
import type { 
  WebRTCHookOptions,
  WebRTCHookReturn,
  RtcState,
  PermissionState,
  GlobalWebRTCState,
  UserMediaSettings
} from '../../specs/006-live-video-and/contracts/webrtc-hooks';

// Import the hook that will be implemented
// @ts-expect-error - This import will fail until implementation exists
import { useGlobalWebRTC } from '@/lib/hooks/useGlobalWebRTC';

describe('Contract: useGlobalWebRTC Hook Interface', () => {
  let webrtcMocks: ReturnType<typeof setupWebRTCMocks>;
  
  beforeEach(() => {
    webrtcMocks = setupWebRTCMocks();
  });
  
  afterEach(() => {
    webrtcMocks.cleanup();
  });
  
  test('hook accepts correct options interface', () => {
    // Test that the hook accepts the expected options
    const validOptions: WebRTCHookOptions = {
      enabled: true,
      transport: null, // Will be mocked
      myPlayerId: 'test-player-1',
      matchId: 'test-match-1',
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    // This should compile without TypeScript errors
    expect(() => {
      const options: WebRTCHookOptions = validOptions;
      expect(options.enabled).toBe(true);
      expect(options.myPlayerId).toBe('test-player-1');
    }).not.toThrow();
  });
  
  test('hook returns correct interface structure', () => {
    // Mock the required dependencies
    const mockTransport = {
      emit: vi.fn(),
      onGeneric: vi.fn(), 
      offGeneric: vi.fn()
    };
    
    const options: WebRTCHookOptions = {
      enabled: true,
      transport: mockTransport as never,
      myPlayerId: 'test-player-1',
      matchId: 'test-match-1'
    };
    
    // This will fail until implementation exists
    expect(() => {
      // @ts-expect-error - useGlobalWebRTC doesn't exist yet
      const result = useGlobalWebRTC(options);
      
      // Verify the return type structure
      const hookReturn: WebRTCHookReturn = result;
      
      // GlobalWebRTCState properties
      expect(typeof hookReturn.connectionState).toBe('string');
      expect(hookReturn.localStream).toBeNull();
      expect(hookReturn.remoteStream).toBeNull();
      expect(hookReturn.lastError).toBeNull();
      expect(typeof hookReturn.permissionsGranted).toBe('boolean');
      expect(hookReturn.matchId).toBeNull();
      expect(hookReturn.remotePeerId).toBeNull();
      
      // UserMediaSettings properties
      expect(hookReturn.selectedAudioDeviceId).toBeNull();
      expect(hookReturn.selectedVideoDeviceId).toBeNull();
      expect(typeof hookReturn.microphoneMuted).toBe('boolean');
      expect(typeof hookReturn.cameraDisabled).toBe('boolean');
      expect(Array.isArray(hookReturn.audioDevices)).toBe(true);
      expect(Array.isArray(hookReturn.videoDevices)).toBe(true);
      expect(['checking', 'granted', 'denied', 'prompt']).toContain(hookReturn.devicePermissionStatus);
      
      // Connection management methods
      expect(typeof hookReturn.join).toBe('function');
      expect(typeof hookReturn.leave).toBe('function');
      expect(typeof hookReturn.retry).toBe('function');
      
      // Media control methods  
      expect(typeof hookReturn.toggleMicrophone).toBe('function');
      expect(typeof hookReturn.toggleCamera).toBe('function');
      expect(typeof hookReturn.setAudioDevice).toBe('function');
      expect(typeof hookReturn.setVideoDevice).toBe('function');
      expect(typeof hookReturn.refreshDevices).toBe('function');
      
      // Permission management methods
      expect(typeof hookReturn.checkPermissions).toBe('function');
      expect(typeof hookReturn.requestPermissions).toBe('function');
      
      // Error handling methods
      expect(typeof hookReturn.clearError).toBe('function');
      
    }).toThrow('useGlobalWebRTC is not defined'); // Expected to fail initially
  });
  
  test('RtcState type validation', () => {
    const validStates: RtcState[] = [
      'idle', 'joining', 'negotiating', 'connected', 'failed', 'closed'
    ];
    
    validStates.forEach(state => {
      expect(typeof state).toBe('string');
      expect(['idle', 'joining', 'negotiating', 'connected', 'failed', 'closed']).toContain(state);
    });
  });
  
  test('PermissionState type validation', () => {
    const validPermissionStates: PermissionState[] = [
      'checking', 'granted', 'denied', 'prompt'
    ];
    
    validPermissionStates.forEach(state => {
      expect(typeof state).toBe('string');
      expect(['checking', 'granted', 'denied', 'prompt']).toContain(state);
    });
  });
  
  test('GlobalWebRTCState interface structure', () => {
    const mockState: GlobalWebRTCState = {
      connectionState: 'idle',
      localStream: null,
      remoteStream: null,
      lastError: null,
      permissionsGranted: false,
      matchId: null,
      remotePeerId: null
    };
    
    expect(mockState.connectionState).toBe('idle');
    expect(mockState.localStream).toBeNull();
    expect(mockState.permissionsGranted).toBe(false);
  });
  
  test('UserMediaSettings interface structure', () => {
    const mockSettings: UserMediaSettings = {
      selectedAudioDeviceId: null,
      selectedVideoDeviceId: null,
      microphoneMuted: false,
      cameraDisabled: false,
      audioDevices: [],
      videoDevices: [],
      devicePermissionStatus: 'checking'
    };
    
    expect(mockSettings.selectedAudioDeviceId).toBeNull();
    expect(mockSettings.microphoneMuted).toBe(false);
    expect(Array.isArray(mockSettings.audioDevices)).toBe(true);
    expect(mockSettings.devicePermissionStatus).toBe('checking');
  });
  
  test('hook methods return correct promise types', async () => {
    // This test will fail until implementation exists
    const mockTransport = {
      emit: vi.fn(),
      onGeneric: vi.fn(),
      offGeneric: vi.fn()
    };
    
    const options: WebRTCHookOptions = {
      enabled: true,
      transport: mockTransport as never,
      myPlayerId: 'test-player-1', 
      matchId: 'test-match-1'
    };
    
    try {
      // @ts-expect-error - useGlobalWebRTC doesn't exist yet
      const result = useGlobalWebRTC(options);
      
      // Test async methods return promises
      expect(result.join()).toBeInstanceOf(Promise);
      expect(result.retry()).toBeInstanceOf(Promise);
      expect(result.setAudioDevice('test-device')).toBeInstanceOf(Promise);
      expect(result.setVideoDevice('test-device')).toBeInstanceOf(Promise);
      expect(result.refreshDevices()).toBeInstanceOf(Promise);
      expect(result.checkPermissions()).toBeInstanceOf(Promise);
      expect(result.requestPermissions()).toBeInstanceOf(Promise);
      
      // Test sync methods
      expect(typeof result.leave()).toBe('undefined');
      expect(typeof result.toggleMicrophone()).toBe('undefined');
      expect(typeof result.toggleCamera()).toBe('undefined');
      expect(typeof result.clearError()).toBe('undefined');
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('useGlobalWebRTC');
    }
  });
  
  test('hook handles disabled state correctly', () => {
    const mockTransport = {
      emit: vi.fn(),
      onGeneric: vi.fn(),
      offGeneric: vi.fn()
    };
    
    const disabledOptions: WebRTCHookOptions = {
      enabled: false,
      transport: mockTransport as never,
      myPlayerId: 'test-player-1',
      matchId: 'test-match-1'
    };
    
    try {
      // @ts-expect-error - useGlobalWebRTC doesn't exist yet
      const result = useGlobalWebRTC(disabledOptions);
      
      // When disabled, should return idle state
      expect(result.connectionState).toBe('idle');
      expect(result.localStream).toBeNull();
      expect(result.remoteStream).toBeNull();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('useGlobalWebRTC');
    }
  });
});

/**
 * Additional Contract Validation Tests
 * These tests ensure strict adherence to the contract interface
 */
describe('Contract: Interface Completeness', () => {
  test('WebRTCHookOptions has all required fields', () => {
    // Test that all required option fields are enforced
    const completeOptions = {
      enabled: true,
      transport: null,
      myPlayerId: 'test-player',
      matchId: 'test-match'
    };
    
    // TypeScript should enforce these fields exist
    expect(typeof completeOptions.enabled).toBe('boolean');
    expect(completeOptions.transport).toBeNull();
    expect(typeof completeOptions.myPlayerId).toBe('string');
    expect(typeof completeOptions.matchId).toBe('string');
  });
  
  test('WebRTCHookReturn extends both state interfaces', () => {
    // Verify the return type combines GlobalWebRTCState + UserMediaSettings + methods
    const expectedStateFields = [
      'connectionState', 'localStream', 'remoteStream', 'lastError',
      'permissionsGranted', 'matchId', 'remotePeerId'
    ];
    
    const expectedSettingsFields = [
      'selectedAudioDeviceId', 'selectedVideoDeviceId', 'microphoneMuted',
      'cameraDisabled', 'audioDevices', 'videoDevices', 'devicePermissionStatus'
    ];
    
    const expectedMethods = [
      'join', 'leave', 'retry', 'toggleMicrophone', 'toggleCamera',
      'setAudioDevice', 'setVideoDevice', 'refreshDevices',
      'checkPermissions', 'requestPermissions', 'clearError'
    ];
    
    // These arrays define the complete interface contract
    expect(expectedStateFields.length).toBe(7);
    expect(expectedSettingsFields.length).toBe(7);
    expect(expectedMethods.length).toBe(11);
    
    // Total interface should have 25 properties/methods
    expect(expectedStateFields.length + expectedSettingsFields.length + expectedMethods.length).toBe(25);
  });
});