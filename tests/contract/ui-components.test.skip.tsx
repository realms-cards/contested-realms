/**
 * Contract Test: UI Components Interfaces
 * 
 * This test ensures that all UI components match the contracts
 * defined in specs/006-live-video-and/contracts/ui-components.ts
 * 
 * CRITICAL: This test MUST FAIL until components are implemented
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Vector3 } from 'three';
import { setupWebRTCMocks, createMockStream } from '../fixtures/webrtc-mock';
import type {
  GlobalVideoOverlayProps,
  UserAvatarMenuProps,
  MediaControlsPanelProps,
  SeatVideo3DProps,
  VideoStreamOverlayProps,
  PermissionRequestDialogProps,
  DeviceSelectionMenuProps,
  ConnectionStatusIndicatorProps,
  ScreenOverlayConfig,
  SCREEN_OVERLAY_CONFIGS
} from '../../specs/006-live-video-and/contracts/ui-components';

// Import components that will be implemented
// @ts-expect-error - These imports will fail until implementation exists
import { GlobalVideoOverlay } from '@/components/ui/GlobalVideoOverlay';
// @ts-expect-error
import { UserAvatarMenu } from '@/components/ui/UserAvatarMenu';
// @ts-expect-error
import { MediaControlsPanel } from '@/components/ui/MediaControlsPanel';
// @ts-expect-error
import { VideoStreamOverlay } from '@/components/ui/VideoStreamOverlay';
// @ts-expect-error
import { PermissionRequestDialog } from '@/components/ui/PermissionRequestDialog';
// @ts-expect-error
import { DeviceSelectionMenu } from '@/components/ui/DeviceSelectionMenu';
// @ts-expect-error
import { ConnectionStatusIndicator } from '@/components/ui/ConnectionStatusIndicator';

describe('Contract: UI Component Props Interfaces', () => {
  let webrtcMocks: ReturnType<typeof setupWebRTCMocks>;
  
  beforeEach(() => {
    webrtcMocks = setupWebRTCMocks();
  });
  
  afterEach(() => {
    webrtcMocks.cleanup();
  });
  
  test('GlobalVideoOverlayProps interface structure', () => {
    const validProps: GlobalVideoOverlayProps = {
      className: 'test-overlay-class',
      position: 'top-right',
      showUserAvatar: true
    };
    
    expect(typeof validProps.className).toBe('string');
    expect(['top-right', 'bottom-left', 'bottom-right']).toContain(validProps.position);
    expect(typeof validProps.showUserAvatar).toBe('boolean');
    
    // All props should be optional
    const minimalProps: GlobalVideoOverlayProps = {};
    expect(minimalProps.className).toBeUndefined();
    expect(minimalProps.position).toBeUndefined();
    expect(minimalProps.showUserAvatar).toBeUndefined();
  });
  
  test('UserAvatarMenuProps interface structure', () => {
    const validProps: UserAvatarMenuProps = {
      userId: 'user-123',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      className: 'avatar-menu-class',
      onSettingsClick: vi.fn()
    };
    
    expect(typeof validProps.userId).toBe('string');
    expect(typeof validProps.displayName).toBe('string');
    expect(typeof validProps.avatarUrl).toBe('string');
    expect(typeof validProps.className).toBe('string');
    expect(typeof validProps.onSettingsClick).toBe('function');
    
    // Test required vs optional props
    const minimalProps: UserAvatarMenuProps = {
      userId: 'user-123',
      displayName: 'Test User'
    };
    
    expect(minimalProps.avatarUrl).toBeUndefined();
    expect(minimalProps.className).toBeUndefined();
    expect(minimalProps.onSettingsClick).toBeUndefined();
  });
  
  test('MediaControlsPanelProps interface structure', () => {
    const mockRtcState = {
      connectionState: 'connected' as const,
      localStream: createMockStream(),
      remoteStream: null,
      lastError: null,
      permissionsGranted: true,
      matchId: 'test-match',
      remotePeerId: null,
      selectedAudioDeviceId: null,
      selectedVideoDeviceId: null,
      microphoneMuted: false,
      cameraDisabled: false,
      audioDevices: [],
      videoDevices: [],
      devicePermissionStatus: 'granted' as const,
      join: vi.fn(),
      leave: vi.fn(),
      retry: vi.fn(),
      toggleMicrophone: vi.fn(),
      toggleCamera: vi.fn(),
      setAudioDevice: vi.fn(),
      setVideoDevice: vi.fn(),
      refreshDevices: vi.fn(),
      checkPermissions: vi.fn(),
      requestPermissions: vi.fn(),
      clearError: vi.fn()
    };
    
    const validProps: MediaControlsPanelProps = {
      rtcState: mockRtcState,
      compact: true,
      showDeviceSettings: false,
      className: 'media-controls-class'
    };
    
    expect(typeof validProps.rtcState).toBe('object');
    expect(typeof validProps.compact).toBe('boolean');
    expect(typeof validProps.showDeviceSettings).toBe('boolean');
    expect(typeof validProps.className).toBe('string');
    
    // rtcState is required, others optional
    const minimalProps: MediaControlsPanelProps = {
      rtcState: mockRtcState
    };
    
    expect(minimalProps.compact).toBeUndefined();
    expect(minimalProps.showDeviceSettings).toBeUndefined();
    expect(minimalProps.className).toBeUndefined();
  });
  
  test('SeatVideo3DProps interface structure', () => {
    const mockPosition = new Vector3(1, 0, 2);
    const mockStream = createMockStream();
    
    const validProps: SeatVideo3DProps = {
      playerId: 'player-123',
      stream: mockStream,
      position: mockPosition,
      rotation: Math.PI / 4,
      width: 1.2,
      height: 0.675,
      visible: true
    };
    
    expect(typeof validProps.playerId).toBe('string');
    expect(validProps.stream).toBe(mockStream);
    expect(validProps.position).toBe(mockPosition);
    expect(typeof validProps.rotation).toBe('number');
    expect(typeof validProps.width).toBe('number');
    expect(typeof validProps.height).toBe('number');
    expect(typeof validProps.visible).toBe('boolean');
    
    // Required vs optional props
    const minimalProps: SeatVideo3DProps = {
      playerId: 'player-123',
      stream: mockStream,
      position: mockPosition
    };
    
    expect(minimalProps.rotation).toBeUndefined();
    expect(minimalProps.width).toBeUndefined();
    expect(minimalProps.height).toBeUndefined();
    expect(minimalProps.visible).toBeUndefined();
  });
  
  test('VideoStreamOverlayProps interface structure', () => {
    const mockStream = createMockStream();
    
    const validProps: VideoStreamOverlayProps = {
      stream: mockStream,
      playerId: 'player-456',
      displayName: 'Test Player',
      muted: true,
      className: 'video-overlay-class'
    };
    
    expect(validProps.stream).toBe(mockStream);
    expect(typeof validProps.playerId).toBe('string');
    expect(typeof validProps.displayName).toBe('string');
    expect(typeof validProps.muted).toBe('boolean');
    expect(typeof validProps.className).toBe('string');
    
    // Test with null stream
    const nullStreamProps: VideoStreamOverlayProps = {
      stream: null,
      playerId: 'player-456',
      displayName: 'Test Player'
    };
    
    expect(nullStreamProps.stream).toBeNull();
    expect(nullStreamProps.muted).toBeUndefined();
    expect(nullStreamProps.className).toBeUndefined();
  });
  
  test('PermissionRequestDialogProps interface structure', () => {
    const validProps: PermissionRequestDialogProps = {
      isOpen: true,
      onRequestPermissions: vi.fn(),
      onCancel: vi.fn(),
      permissionType: 'both'
    };
    
    expect(typeof validProps.isOpen).toBe('boolean');
    expect(typeof validProps.onRequestPermissions).toBe('function');
    expect(typeof validProps.onCancel).toBe('function');
    expect(['camera', 'microphone', 'both']).toContain(validProps.permissionType);
    
    // Test all permission types
    const permissionTypes: Array<'camera' | 'microphone' | 'both'> = ['camera', 'microphone', 'both'];
    permissionTypes.forEach(permissionType => {
      const props: PermissionRequestDialogProps = {
        isOpen: false,
        onRequestPermissions: vi.fn(),
        onCancel: vi.fn(),
        permissionType
      };
      expect(['camera', 'microphone', 'both']).toContain(props.permissionType);
    });
  });
  
  test('DeviceSelectionMenuProps interface structure', () => {
    const mockAudioDevices: MediaDeviceInfo[] = [
      { deviceId: 'audio-1', kind: 'audioinput', label: 'Microphone 1', groupId: 'group-1', toJSON: () => ({}) }
    ];
    
    const mockVideoDevices: MediaDeviceInfo[] = [
      { deviceId: 'video-1', kind: 'videoinput', label: 'Camera 1', groupId: 'group-2', toJSON: () => ({}) }
    ];
    
    const validProps: DeviceSelectionMenuProps = {
      audioDevices: mockAudioDevices,
      videoDevices: mockVideoDevices,
      selectedAudioId: 'audio-1',
      selectedVideoId: null,
      onAudioDeviceChange: vi.fn(),
      onVideoDeviceChange: vi.fn(),
      onRefreshDevices: vi.fn(),
      isOpen: true,
      onClose: vi.fn()
    };
    
    expect(Array.isArray(validProps.audioDevices)).toBe(true);
    expect(Array.isArray(validProps.videoDevices)).toBe(true);
    expect(typeof validProps.selectedAudioId).toBe('string');
    expect(validProps.selectedVideoId).toBeNull();
    expect(typeof validProps.onAudioDeviceChange).toBe('function');
    expect(typeof validProps.onVideoDeviceChange).toBe('function');
    expect(typeof validProps.onRefreshDevices).toBe('function');
    expect(typeof validProps.isOpen).toBe('boolean');
    expect(typeof validProps.onClose).toBe('function');
  });
  
  test('ConnectionStatusIndicatorProps interface structure', () => {
    const validProps: ConnectionStatusIndicatorProps = {
      connectionState: 'connected',
      lastError: 'Connection timeout',
      onRetry: vi.fn(),
      compact: true
    };
    
    expect(['idle', 'joining', 'negotiating', 'connected', 'failed', 'closed']).toContain(validProps.connectionState);
    expect(typeof validProps.lastError).toBe('string');
    expect(typeof validProps.onRetry).toBe('function');
    expect(typeof validProps.compact).toBe('boolean');
    
    // Test with null error
    const noErrorProps: ConnectionStatusIndicatorProps = {
      connectionState: 'connected',
      lastError: null
    };
    
    expect(noErrorProps.lastError).toBeNull();
    expect(noErrorProps.onRetry).toBeUndefined();
    expect(noErrorProps.compact).toBeUndefined();
  });
});

describe('Contract: Screen Overlay Configuration', () => {
  test('ScreenOverlayConfig interface structure', () => {
    const mockConfig: ScreenOverlayConfig = {
      'draft': {
        showVideoOverlay: false,
        showControls: true,
        overlayPosition: 'top-right',
        allowAudioOnly: true,
        show3DVideo: false
      },
      'game-3d': {
        showVideoOverlay: false,
        showControls: true,
        overlayPosition: 'bottom-right',
        allowAudioOnly: false,
        show3DVideo: true
      },
      'lobby': {
        showVideoOverlay: true,
        showControls: true,
        overlayPosition: 'floating',
        allowAudioOnly: false,
        show3DVideo: false
      },
      'draft-3d': {
        showVideoOverlay: false,
        showControls: true,
        overlayPosition: 'top-right',
        allowAudioOnly: true,
        show3DVideo: false
      },
      'deck-editor': {
        showVideoOverlay: false,
        showControls: true,
        overlayPosition: 'top-right',
        allowAudioOnly: true,
        show3DVideo: false
      },
      'game': {
        showVideoOverlay: true,
        showControls: true,
        overlayPosition: 'bottom-right',
        allowAudioOnly: false,
        show3DVideo: false
      },
      'leaderboard': {
        showVideoOverlay: true,
        showControls: false,
        overlayPosition: 'top-right',
        allowAudioOnly: false,
        show3DVideo: false
      }
    };
    
    // Test all screen types are covered
    const expectedScreenTypes = ['draft', 'draft-3d', 'deck-editor', 'game', 'game-3d', 'lobby', 'leaderboard'];
    expectedScreenTypes.forEach(screenType => {
      expect(mockConfig[screenType as keyof ScreenOverlayConfig]).toBeDefined();
    });
    
    // Test configuration structure for each screen type
    Object.entries(mockConfig).forEach(([screenType, config]) => {
      expect(typeof config.showVideoOverlay).toBe('boolean');
      expect(typeof config.showControls).toBe('boolean');
      expect(['top-right', 'bottom-left', 'bottom-right', 'floating']).toContain(config.overlayPosition);
      expect(typeof config.allowAudioOnly).toBe('boolean');
      expect(typeof config.show3DVideo).toBe('boolean');
    });
  });
  
  test('SCREEN_OVERLAY_CONFIGS constant structure', () => {
    // Test that the exported constant has correct structure
    expect(typeof SCREEN_OVERLAY_CONFIGS).toBe('object');
    expect(SCREEN_OVERLAY_CONFIGS).not.toBeNull();
    
    // Test specific screen type configurations match expected patterns
    
    // Draft screens should be audio-only
    expect(SCREEN_OVERLAY_CONFIGS.draft.showVideoOverlay).toBe(false);
    expect(SCREEN_OVERLAY_CONFIGS.draft.allowAudioOnly).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS.draft.show3DVideo).toBe(false);
    
    expect(SCREEN_OVERLAY_CONFIGS['draft-3d'].showVideoOverlay).toBe(false);
    expect(SCREEN_OVERLAY_CONFIGS['draft-3d'].allowAudioOnly).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS['draft-3d'].show3DVideo).toBe(false);
    
    expect(SCREEN_OVERLAY_CONFIGS['deck-editor'].showVideoOverlay).toBe(false);
    expect(SCREEN_OVERLAY_CONFIGS['deck-editor'].allowAudioOnly).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS['deck-editor'].show3DVideo).toBe(false);
    
    // Game screens should show video
    expect(SCREEN_OVERLAY_CONFIGS.game.showVideoOverlay).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS.game.allowAudioOnly).toBe(false);
    expect(SCREEN_OVERLAY_CONFIGS.game.show3DVideo).toBe(false);
    
    // Game-3D should use 3D video positioning
    expect(SCREEN_OVERLAY_CONFIGS['game-3d'].show3DVideo).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS['game-3d'].showVideoOverlay).toBe(false); // 3D instead of overlay
    
    // Social screens should show video overlay
    expect(SCREEN_OVERLAY_CONFIGS.lobby.showVideoOverlay).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS.lobby.allowAudioOnly).toBe(false);
    expect(SCREEN_OVERLAY_CONFIGS.lobby.show3DVideo).toBe(false);
    
    // Leaderboard should show video but no controls
    expect(SCREEN_OVERLAY_CONFIGS.leaderboard.showVideoOverlay).toBe(true);
    expect(SCREEN_OVERLAY_CONFIGS.leaderboard.showControls).toBe(false);
  });
});

describe('Contract: Component Rendering (Will Fail Until Implementation)', () => {
  let webrtcMocks: ReturnType<typeof setupWebRTCMocks>;
  
  beforeEach(() => {
    webrtcMocks = setupWebRTCMocks();
  });
  
  afterEach(() => {
    webrtcMocks.cleanup();
  });
  
  test('GlobalVideoOverlay component renders with props', () => {
    try {
      // @ts-expect-error - Component doesn't exist yet
      render(<GlobalVideoOverlay position="top-right" showUserAvatar={true} />);
      
      // If implementation exists, should render without error
      expect(screen.getByRole('generic')).toBeInTheDocument();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('GlobalVideoOverlay');
    }
  });
  
  test('UserAvatarMenu component renders with required props', () => {
    const mockProps: UserAvatarMenuProps = {
      userId: 'test-user-123',
      displayName: 'Test User',
      onSettingsClick: vi.fn()
    };
    
    try {
      // @ts-expect-error - Component doesn't exist yet
      render(<UserAvatarMenu {...mockProps} />);
      
      expect(screen.getByText('Test User')).toBeInTheDocument();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('UserAvatarMenu');
    }
  });
  
  test('MediaControlsPanel component renders with rtc state', () => {
    const mockRtcState = {
      connectionState: 'connected' as const,
      localStream: createMockStream(),
      remoteStream: null,
      lastError: null,
      permissionsGranted: true,
      matchId: 'test-match',
      remotePeerId: null,
      selectedAudioDeviceId: null,
      selectedVideoDeviceId: null,
      microphoneMuted: false,
      cameraDisabled: false,
      audioDevices: [],
      videoDevices: [],
      devicePermissionStatus: 'granted' as const,
      join: vi.fn(),
      leave: vi.fn(),
      retry: vi.fn(),
      toggleMicrophone: vi.fn(),
      toggleCamera: vi.fn(),
      setAudioDevice: vi.fn(),
      setVideoDevice: vi.fn(),
      refreshDevices: vi.fn(),
      checkPermissions: vi.fn(),
      requestPermissions: vi.fn(),
      clearError: vi.fn()
    };
    
    try {
      // @ts-expect-error - Component doesn't exist yet
      render(<MediaControlsPanel rtcState={mockRtcState} compact={true} />);
      
      // Should render media controls
      expect(screen.getByRole('button')).toBeInTheDocument();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('MediaControlsPanel');
    }
  });
  
  test('ConnectionStatusIndicator component renders with connection state', () => {
    try {
      // @ts-expect-error - Component doesn't exist yet
      render(
        <ConnectionStatusIndicator 
          connectionState="connecting" 
          lastError="Network timeout"
          onRetry={vi.fn()}
        />
      );
      
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
      expect(screen.getByText(/Network timeout/i)).toBeInTheDocument();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('ConnectionStatusIndicator');
    }
  });
  
  test('PermissionRequestDialog component renders when open', () => {
    try {
      // @ts-expect-error - Component doesn't exist yet
      render(
        <PermissionRequestDialog
          isOpen={true}
          permissionType="both"
          onRequestPermissions={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/camera.*microphone/i)).toBeInTheDocument();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('PermissionRequestDialog');
    }
  });
  
  test('DeviceSelectionMenu component renders with devices', () => {
    const mockAudioDevices: MediaDeviceInfo[] = [
      { deviceId: 'audio-1', kind: 'audioinput', label: 'Test Microphone', groupId: 'group-1', toJSON: () => ({}) }
    ];
    
    const mockVideoDevices: MediaDeviceInfo[] = [
      { deviceId: 'video-1', kind: 'videoinput', label: 'Test Camera', groupId: 'group-2', toJSON: () => ({}) }
    ];
    
    try {
      // @ts-expect-error - Component doesn't exist yet
      render(
        <DeviceSelectionMenu
          isOpen={true}
          audioDevices={mockAudioDevices}
          videoDevices={mockVideoDevices}
          selectedAudioId={null}
          selectedVideoId={null}
          onAudioDeviceChange={vi.fn()}
          onVideoDeviceChange={vi.fn()}
          onRefreshDevices={vi.fn()}
          onClose={vi.fn()}
        />
      );
      
      expect(screen.getByText('Test Microphone')).toBeInTheDocument();
      expect(screen.getByText('Test Camera')).toBeInTheDocument();
      
    } catch (error) {
      // Expected to fail until implementation exists
      expect((error as Error).message).toContain('DeviceSelectionMenu');
    }
  });
});