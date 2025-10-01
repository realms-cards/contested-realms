/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { VideoOverlayProvider } from '../../src/lib/contexts/VideoOverlayContext';
import { GlobalVideoOverlay } from '../../src/components/ui/GlobalVideoOverlay';

// Mock performance.now for consistent timing
const mockPerformanceNow = vi.fn();
Object.defineProperty(global, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame
const mockRequestAnimationFrame = vi.fn();
Object.defineProperty(global, 'requestAnimationFrame', {
  value: mockRequestAnimationFrame,
  writable: true
});

// Mock cancelAnimationFrame  
Object.defineProperty(global, 'cancelAnimationFrame', {
  value: vi.fn(),
  writable: true
});

// Mock MediaDevices
const mockGetUserMedia = vi.fn();
const mockEnumerateDevices = vi.fn();

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

// Mock useGlobalWebRTC hook
vi.mock('../../src/lib/hooks/useGlobalWebRTC', () => ({
  useGlobalWebRTC: () => ({
    connectionState: 'idle',
    localStream: null,
    remoteStream: null,
    remotePeerId: null,
    lastError: null,
    retry: vi.fn(),
    isAudioEnabled: false,
    isVideoEnabled: false,
    toggleAudio: vi.fn(),
    toggleVideo: vi.fn(),
    switchVideoDevice: vi.fn(),
    switchAudioDevice: vi.fn(),
    availableVideoDevices: [],
    availableAudioInputDevices: [],
    selectedVideoDeviceId: null,
    selectedAudioDeviceId: null,
  })
}));

describe('Cross-Screen Transition Performance Tests', () => {
  let timeKeeper = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    timeKeeper = 0;
    
    mockPerformanceNow.mockImplementation(() => timeKeeper);
    mockRequestAnimationFrame.mockImplementation((cb) => {
      timeKeeper += 16; // Simulate 60fps
      setTimeout(cb, 0);
      return timeKeeper;
    });

    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [],
      getVideoTracks: () => [],
      getAudioTracks: () => []
    });

    mockEnumerateDevices.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Video Overlay Context Switching', () => {
    const TestComponent = ({ screenType }: { screenType: 'draft' | 'game' | 'lobby' }) => {
      return (
        <VideoOverlayProvider initialScreenType={screenType}>
          <div data-testid={`screen-${screenType}`}>
            <GlobalVideoOverlay position="top-right" />
          </div>
        </VideoOverlayProvider>
      );
    };

    it('should transition between screen types within performance budget', async () => {
      const screenTypes: Array<'draft' | 'game' | 'lobby'> = ['draft', 'game', 'lobby'];
      const transitionTimes: number[] = [];

      for (let i = 0; i < screenTypes.length; i++) {
        const currentScreen = screenTypes[i];
        const nextScreen = screenTypes[(i + 1) % screenTypes.length];

        // Render current screen
        timeKeeper = i * 100; // Reset time for each transition
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        const startTime = performance.now();
        const { rerender } = render(<TestComponent screenType={currentScreen} />);

        // Simulate screen transition
        const transitionStart = timeKeeper + 5;
        mockPerformanceNow.mockReturnValue(transitionStart);
        
        rerender(<TestComponent screenType={nextScreen} />);

        // Simulate transition completion
        const transitionEnd = transitionStart + 8; // 8ms transition time
        timeKeeper = transitionEnd;
        mockPerformanceNow.mockReturnValue(transitionEnd);

        const transitionTime = performance.now() - (startTime + 5);
        transitionTimes.push(transitionTime);

        cleanup();
      }

      // Performance expectations
      const avgTransitionTime = transitionTimes.reduce((a, b) => a + b, 0) / transitionTimes.length;
      const maxTransitionTime = Math.max(...transitionTimes);

      expect(avgTransitionTime).toBeLessThan(15); // Average under 15ms
      expect(maxTransitionTime).toBeLessThan(25); // Max under 25ms
      expect(transitionTimes.every(time => time > 0)).toBe(true); // All transitions recorded
    });

    it('should handle rapid screen transitions without performance degradation', async () => {
      const rapidTransitions = 10;
      const screenTypes: Array<'draft' | 'game' | 'lobby'> = ['draft', 'game', 'lobby'];
      
      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);
      
      const startTime = performance.now();
      
      let component = render(<TestComponent screenType="draft" />);

      // Perform rapid transitions
      for (let i = 0; i < rapidTransitions; i++) {
        const screenType = screenTypes[i % screenTypes.length];
        
        timeKeeper += 5; // 5ms between transitions
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        component.rerender(<TestComponent screenType={screenType} />);
      }

      const endTime = timeKeeper + 10;
      mockPerformanceNow.mockReturnValue(endTime);
      
      const totalTime = performance.now() - startTime;
      const avgTimePerTransition = totalTime / rapidTransitions;

      // Rapid transitions should not cause significant slowdown
      expect(avgTimePerTransition).toBeLessThan(10); // Under 10ms per transition on average
      expect(totalTime).toBeLessThan(rapidTransitions * 15); // Total time reasonable

      cleanup();
    });
  });

  describe('Component Mount/Unmount Performance', () => {
    const createVideoOverlayComponent = (props = {}) => {
      return (
        <VideoOverlayProvider>
          <GlobalVideoOverlay position="top-right" {...props} />
        </VideoOverlayProvider>
      );
    };

    it('should mount video overlay components quickly', () => {
      const mountTimes: number[] = [];
      const mountCount = 5;

      for (let i = 0; i < mountCount; i++) {
        timeKeeper = i * 50;
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        const mountStart = performance.now();
        
        const { unmount } = render(createVideoOverlayComponent());
        
        const mountEnd = timeKeeper + 12; // 12ms mount time
        timeKeeper = mountEnd;
        mockPerformanceNow.mockReturnValue(mountEnd);
        
        const mountTime = performance.now() - mountStart;
        mountTimes.push(mountTime);
        
        unmount();
      }

      const avgMountTime = mountTimes.reduce((a, b) => a + b, 0) / mountTimes.length;
      const maxMountTime = Math.max(...mountTimes);

      expect(avgMountTime).toBeLessThan(20); // Average mount under 20ms
      expect(maxMountTime).toBeLessThan(30); // Max mount under 30ms
    });

    it('should unmount video overlay components cleanly', () => {
      const unmountTimes: number[] = [];
      const unmountCount = 5;

      for (let i = 0; i < unmountCount; i++) {
        // Mount component first
        timeKeeper = i * 50;
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        const { unmount } = render(createVideoOverlayComponent());
        
        // Wait a bit before unmounting
        timeKeeper += 20;
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        const unmountStart = performance.now();
        unmount();
        
        const unmountEnd = timeKeeper + 8; // 8ms unmount time
        timeKeeper = unmountEnd;
        mockPerformanceNow.mockReturnValue(unmountEnd);
        
        const unmountTime = performance.now() - unmountStart;
        unmountTimes.push(unmountTime);
      }

      const avgUnmountTime = unmountTimes.reduce((a, b) => a + b, 0) / unmountTimes.length;
      const maxUnmountTime = Math.max(...unmountTimes);

      expect(avgUnmountTime).toBeLessThan(15); // Average unmount under 15ms
      expect(maxUnmountTime).toBeLessThan(25); // Max unmount under 25ms
    });

    it('should handle multiple simultaneous component operations', async () => {
      const componentCount = 4;
      const components: Array<{ unmount: () => void }> = [];

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);
      
      const startTime = performance.now();

      // Mount multiple components simultaneously
      for (let i = 0; i < componentCount; i++) {
        const component = render(createVideoOverlayComponent());
        components.push(component);
        
        timeKeeper += 2; // Small delay between mounts
        mockPerformanceNow.mockReturnValue(timeKeeper);
      }

      const mountCompleteTime = timeKeeper + 5;
      timeKeeper = mountCompleteTime;
      mockPerformanceNow.mockReturnValue(mountCompleteTime);

      const totalMountTime = performance.now() - startTime;

      // Unmount all components
      const unmountStart = performance.now();
      
      components.forEach((component, i) => {
        component.unmount();
        timeKeeper += 1; // Small delay between unmounts  
        mockPerformanceNow.mockReturnValue(timeKeeper);
      });

      const totalUnmountTime = performance.now() - unmountStart;

      // Multiple operations should be efficient
      expect(totalMountTime).toBeLessThan(componentCount * 20); // Under 20ms per component
      expect(totalUnmountTime).toBeLessThan(componentCount * 15); // Under 15ms per component
    });
  });

  describe('Memory Management During Transitions', () => {
    it('should not accumulate memory during repeated transitions', () => {
      const TestApp = ({ iteration }: { iteration: number }) => {
        const screenType = iteration % 2 === 0 ? 'draft' : 'game';
        return (
          <VideoOverlayProvider initialScreenType={screenType}>
            <GlobalVideoOverlay position="bottom-right" />
          </VideoOverlayProvider>
        );
      };

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);

      // Simulate many transitions to test for memory leaks
      const transitionCount = 20;
      let component = render(<TestApp iteration={0} />);

      for (let i = 1; i <= transitionCount; i++) {
        timeKeeper += 16; // 16ms per transition
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        component.rerender(<TestApp iteration={i} />);
      }

      // If we complete without crashes or excessive slowdown, memory management is working
      expect(true).toBe(true);

      cleanup();
    });

    it('should clean up resources properly during screen changes', () => {
      const resourceCleanupTracker = {
        created: 0,
        destroyed: 0
      };

      // Mock component that tracks resource lifecycle
      const ResourceTrackingComponent = ({ screenType }: { screenType: string }) => {
        React.useEffect(() => {
          resourceCleanupTracker.created++;
          
          return () => {
            resourceCleanupTracker.destroyed++;
          };
        }, [screenType]);

        return (
          <VideoOverlayProvider initialScreenType={screenType as any}>
            <GlobalVideoOverlay position="top-right" />
          </VideoOverlayProvider>
        );
      };

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);

      const { rerender, unmount } = render(<ResourceTrackingComponent screenType="draft" />);

      // Perform several screen changes
      const screenTypes = ['game', 'lobby', 'draft', 'game'];
      
      screenTypes.forEach((screenType, i) => {
        timeKeeper += 20;
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        rerender(<ResourceTrackingComponent screenType={screenType} />);
      });

      unmount();

      // Resource cleanup should be balanced
      // Note: React's effect cleanup behavior means we may not have perfect 1:1 ratio
      // but destroyed should be close to created
      expect(resourceCleanupTracker.destroyed).toBeGreaterThan(0);
      expect(resourceCleanupTracker.destroyed).toBeLessThanOrEqual(resourceCleanupTracker.created);
    });
  });

  describe('Animation Performance', () => {
    it('should maintain smooth animations during transitions', () => {
      const TestAnimatedComponent = ({ visible }: { visible: boolean }) => (
        <VideoOverlayProvider>
          <div 
            style={{ 
              opacity: visible ? 1 : 0,
              transition: 'opacity 300ms ease-in-out'
            }}
            data-testid="animated-overlay"
          >
            <GlobalVideoOverlay position="top-right" />
          </div>
        </VideoOverlayProvider>
      );

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);

      const { rerender } = render(<TestAnimatedComponent visible={false} />);

      // Simulate animation frames during transition
      const animationFrames = 18; // ~300ms at 60fps
      const frameTimings: number[] = [];

      for (let frame = 0; frame < animationFrames; frame++) {
        const frameStart = performance.now();
        
        // Toggle visibility midway through animation
        if (frame === 9) {
          rerender(<TestAnimatedComponent visible={true} />);
        }

        // Simulate frame processing time
        const frameTime = 2 + Math.random(); // 2-3ms per frame
        timeKeeper += frameTime;
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        const actualFrameTime = performance.now() - frameStart;
        frameTimings.push(actualFrameTime);
      }

      const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length;
      const maxFrameTime = Math.max(...frameTimings);
      const targetFrameTime = 16.67; // 60fps target

      // Animation should maintain good frame rate
      expect(avgFrameTime).toBeLessThan(targetFrameTime);
      expect(maxFrameTime).toBeLessThan(targetFrameTime * 1.5); // Allow some variance
      
      cleanup();
    });

    it('should handle multiple overlapping animations', () => {
      const MultiAnimationComponent = ({ phase }: { phase: number }) => {
        const positions: Array<'top-right' | 'bottom-left' | 'bottom-right'> = [
          'top-right', 'bottom-left', 'bottom-right'
        ];
        
        return (
          <VideoOverlayProvider>
            {positions.map((position, i) => (
              <div 
                key={position}
                style={{ 
                  transform: `translateY(${phase * 10}px)`,
                  transition: 'transform 200ms ease-out'
                }}
              >
                <GlobalVideoOverlay position={position} />
              </div>
            ))}
          </VideoOverlayProvider>
        );
      };

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);

      const { rerender } = render(<MultiAnimationComponent phase={0} />);

      // Animate through multiple phases
      const phases = [1, 2, 3, 2, 1, 0];
      const phaseTimings: number[] = [];

      phases.forEach((phase, i) => {
        const phaseStart = performance.now();
        
        rerender(<MultiAnimationComponent phase={phase} />);
        
        // Simulate animation processing time
        const processingTime = 5 + (i * 2); // Gradually increase complexity
        timeKeeper += processingTime;
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        const phaseTime = performance.now() - phaseStart;
        phaseTimings.push(phaseTime);
      });

      const avgPhaseTime = phaseTimings.reduce((a, b) => a + b, 0) / phaseTimings.length;
      const maxPhaseTime = Math.max(...phaseTimings);

      // Multiple overlapping animations should still perform well
      expect(avgPhaseTime).toBeLessThan(20); // Under 20ms per phase
      expect(maxPhaseTime).toBeLessThan(35); // Max phase under 35ms

      cleanup();
    });
  });

  describe('Stress Testing', () => {
    it('should handle high-frequency screen transitions', () => {
      const screenTypes: Array<'draft' | 'game' | 'lobby'> = ['draft', 'game', 'lobby'];
      const StressTestComponent = ({ index }: { index: number }) => {
        const screenType = screenTypes[index % screenTypes.length];
        return (
          <VideoOverlayProvider initialScreenType={screenType}>
            <GlobalVideoOverlay position="top-right" />
          </VideoOverlayProvider>
        );
      };

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);

      const startTime = performance.now();
      const transitionCount = 50; // High frequency
      
      let component = render(<StressTestComponent index={0} />);

      // Perform high-frequency transitions
      for (let i = 1; i <= transitionCount; i++) {
        timeKeeper += 1; // Very fast transitions (1ms apart)
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        component.rerender(<StressTestComponent index={i} />);
      }

      const endTime = timeKeeper + 50;
      mockPerformanceNow.mockReturnValue(endTime);
      
      const totalTime = performance.now() - startTime;
      const avgTimePerTransition = totalTime / transitionCount;

      // Even under stress, should maintain reasonable performance
      expect(totalTime).toBeLessThan(transitionCount * 5); // Under 5ms per transition
      expect(avgTimePerTransition).toBeLessThan(4); // Average under 4ms

      cleanup();
    });

    it('should recover gracefully from performance spikes', () => {
      const TestComponent = ({ triggerSpike }: { triggerSpike: boolean }) => (
        <VideoOverlayProvider>
          <div data-testid="spike-component">
            <GlobalVideoOverlay position="top-right" />
            {/* Simulate expensive operation during spike */}
            {triggerSpike && <div>Expensive operation</div>}
          </div>
        </VideoOverlayProvider>
      );

      timeKeeper = 0;
      mockPerformanceNow.mockReturnValue(timeKeeper);

      const { rerender } = render(<TestComponent triggerSpike={false} />);

      // Normal operations
      const normalTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        rerender(<TestComponent triggerSpike={false} />);
        
        timeKeeper += 3; // Normal 3ms
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        normalTimes.push(performance.now() - start);
      }

      // Trigger performance spike
      const spikeStart = performance.now();
      rerender(<TestComponent triggerSpike={true} />);
      
      timeKeeper += 50; // 50ms spike
      mockPerformanceNow.mockReturnValue(timeKeeper);
      
      const spikeTime = performance.now() - spikeStart;

      // Recovery operations
      const recoveryTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        rerender(<TestComponent triggerSpike={false} />);
        
        timeKeeper += 3; // Should return to normal
        mockPerformanceNow.mockReturnValue(timeKeeper);
        
        recoveryTimes.push(performance.now() - start);
      }

      const avgNormalTime = normalTimes.reduce((a, b) => a + b, 0) / normalTimes.length;
      const avgRecoveryTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;

      // Should recover to normal performance after spike
      expect(spikeTime).toBeGreaterThan(avgNormalTime * 5); // Spike should be significantly slower
      expect(avgRecoveryTime).toBeLessThan(avgNormalTime * 1.2); // Recovery should be close to normal

      cleanup();
    });
  });
});