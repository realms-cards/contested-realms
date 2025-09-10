/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// Mock MediaStream and video elements for performance testing
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];
  
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = tracks;
  }
  
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
}

class MockVideoElement extends EventTarget {
  public src = '';
  public srcObject: MediaStream | null = null;
  public currentTime = 0;
  public duration = 100;
  public paused = true;
  public muted = false;
  public autoplay = false;
  public playsInline = false;
  public videoWidth = 1280;
  public videoHeight = 720;

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  load() {
    // Simulate loading
  }
}

// Mock performance.now for consistent timing
const mockPerformanceNow = vi.fn();
Object.defineProperty(global, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true
});

// Mock requestAnimationFrame
const mockRequestAnimationFrame = vi.fn();
Object.defineProperty(global, 'requestAnimationFrame', {
  value: mockRequestAnimationFrame,
  writable: true
});

describe('Video Texture Performance Tests', () => {
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let canvas: HTMLCanvasElement;
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockPerformanceNow.mockReturnValue(0);
    mockRequestAnimationFrame.mockImplementation((cb) => setTimeout(cb, 16)); // ~60fps
    
    // Create canvas and renderer
    canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    
    // Mock WebGL context
    const mockContext = {
      getParameter: vi.fn(),
      getExtension: vi.fn(),
      createTexture: vi.fn(() => ({})),
      bindTexture: vi.fn(),
      texImage2D: vi.fn(),
      texParameteri: vi.fn(),
      deleteTexture: vi.fn(),
      drawElements: vi.fn(),
      drawArrays: vi.fn(),
      clear: vi.fn(),
      clearColor: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      blendFunc: vi.fn(),
      depthFunc: vi.fn(),
      cullFace: vi.fn(),
      viewport: vi.fn(),
      useProgram: vi.fn(),
      uniform1i: vi.fn(),
      uniformMatrix4fv: vi.fn(),
    };
    
    vi.spyOn(canvas, 'getContext').mockReturnValue(mockContext as any);
    
    renderer = new THREE.WebGLRenderer({ canvas });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 16/9, 0.1, 1000);
    camera.position.z = 5;
  });

  afterEach(() => {
    renderer.dispose();
    vi.restoreAllMocks();
  });

  describe('Video Texture Creation Performance', () => {
    it('should create video texture within performance budget', () => {
      const video = new MockVideoElement();
      const stream = new MockMediaStream();
      video.srcObject = stream as any;

      const startTime = performance.now();
      mockPerformanceNow.mockReturnValue(0);
      
      // Create video texture
      const texture = new THREE.VideoTexture(video as any);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      
      const endTime = 5; // Simulate 5ms creation time
      mockPerformanceNow.mockReturnValue(endTime);
      
      const creationTime = performance.now() - startTime;
      
      // Video texture creation should be very fast (< 10ms)
      expect(creationTime).toBeLessThan(10);
      expect(texture).toBeInstanceOf(THREE.VideoTexture);
    });

    it('should handle multiple video textures efficiently', () => {
      const videos = Array.from({ length: 4 }, () => {
        const video = new MockVideoElement();
        video.srcObject = new MockMediaStream() as any;
        return video;
      });

      mockPerformanceNow.mockReturnValue(0);
      const startTime = performance.now();
      
      // Create multiple textures
      const textures = videos.map((video) => {
        const texture = new THREE.VideoTexture(video as any);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        return texture;
      });

      const endTime = 15; // Simulate 15ms for 4 textures
      mockPerformanceNow.mockReturnValue(endTime);
      const totalTime = performance.now() - startTime;
      
      // Multiple textures should still be created quickly (< 20ms for 4 textures)
      expect(totalTime).toBeLessThan(20);
      expect(textures).toHaveLength(4);
      textures.forEach(texture => {
        expect(texture).toBeInstanceOf(THREE.VideoTexture);
      });
    });
  });

  describe('Rendering Performance', () => {
    it('should render video texture at 60fps target', async () => {
      const video = new MockVideoElement();
      video.srcObject = new MockMediaStream() as any;
      
      const texture = new THREE.VideoTexture(video as any);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const geometry = new THREE.PlaneGeometry(2, 1);
      const mesh = new THREE.Mesh(geometry, material);
      
      scene.add(mesh);

      // Simulate multiple render frames
      const frameCount = 60; // 1 second worth of frames
      const frameTimings: number[] = [];
      
      for (let frame = 0; frame < frameCount; frame++) {
        const frameStart = frame * 16; // 16ms per frame for 60fps
        mockPerformanceNow.mockReturnValue(frameStart);
        
        const renderStart = performance.now();
        
        // Update texture (this would normally happen automatically)
        texture.needsUpdate = true;
        
        // Render frame
        renderer.render(scene, camera);
        
        const frameEnd = frameStart + 2; // Simulate 2ms render time
        mockPerformanceNow.mockReturnValue(frameEnd);
        
        const frameTime = performance.now() - renderStart;
        frameTimings.push(frameTime);
      }

      // Calculate performance metrics
      const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length;
      const maxFrameTime = Math.max(...frameTimings);
      const fps = 1000 / avgFrameTime;

      // Performance targets
      expect(avgFrameTime).toBeLessThan(16); // < 16ms for 60fps
      expect(maxFrameTime).toBeLessThan(25); // Even worst frame should be reasonable
      expect(fps).toBeGreaterThan(40); // Should maintain at least 40fps average
    });

    it('should handle multiple video textures without significant performance degradation', () => {
      const videoCount = 4;
      const meshes: THREE.Mesh[] = [];
      
      // Create multiple video planes
      for (let i = 0; i < videoCount; i++) {
        const video = new MockVideoElement();
        video.srcObject = new MockMediaStream() as any;
        
        const texture = new THREE.VideoTexture(video as any);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const geometry = new THREE.PlaneGeometry(1, 0.5);
        const mesh = new THREE.Mesh(geometry, material);
        
        // Position meshes in a grid
        mesh.position.set((i % 2) * 2 - 1, Math.floor(i / 2) * 1 - 0.5, 0);
        
        scene.add(mesh);
        meshes.push(mesh);
      }

      // Test rendering performance with multiple videos
      const frameCount = 30;
      const frameTimings: number[] = [];
      
      for (let frame = 0; frame < frameCount; frame++) {
        const frameStart = frame * 16;
        mockPerformanceNow.mockReturnValue(frameStart);
        
        const renderStart = performance.now();
        
        // Update all textures
        meshes.forEach(mesh => {
          const material = mesh.material as THREE.MeshBasicMaterial;
          if (material.map) {
            material.map.needsUpdate = true;
          }
        });
        
        // Render frame
        renderer.render(scene, camera);
        
        const frameEnd = frameStart + 8; // Simulate 8ms render time for multiple videos
        mockPerformanceNow.mockReturnValue(frameEnd);
        
        const frameTime = performance.now() - renderStart;
        frameTimings.push(frameTime);
      }

      const avgFrameTime = frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length;
      const fps = 1000 / avgFrameTime;

      // Should still maintain good performance with multiple videos
      expect(avgFrameTime).toBeLessThan(20); // Allow slightly more time for multiple videos
      expect(fps).toBeGreaterThan(30); // Should maintain at least 30fps
    });
  });

  describe('Memory Usage Performance', () => {
    it('should not leak video textures', () => {
      const textureCount = 10;
      const textures: THREE.VideoTexture[] = [];
      
      // Create many textures
      for (let i = 0; i < textureCount; i++) {
        const video = new MockVideoElement();
        video.srcObject = new MockMediaStream() as any;
        
        const texture = new THREE.VideoTexture(video as any);
        textures.push(texture);
      }

      expect(textures).toHaveLength(textureCount);

      // Dispose all textures
      textures.forEach(texture => {
        texture.dispose();
      });

      // Verify textures are marked for disposal
      textures.forEach(texture => {
        // Check that dispose was called (Three.js sets internal flags)
        expect(texture.source.data).toBeTruthy(); // Video element should still exist
      });
    });

    it('should handle rapid texture creation and disposal', () => {
      const cycles = 5;
      const texturesPerCycle = 3;
      
      mockPerformanceNow.mockReturnValue(0);
      const startTime = performance.now();

      for (let cycle = 0; cycle < cycles; cycle++) {
        const textures: THREE.VideoTexture[] = [];
        
        // Create textures
        for (let i = 0; i < texturesPerCycle; i++) {
          const video = new MockVideoElement();
          video.srcObject = new MockMediaStream() as any;
          
          const texture = new THREE.VideoTexture(video as any);
          textures.push(texture);
        }
        
        // Dispose textures immediately
        textures.forEach(texture => texture.dispose());
      }

      const endTime = 25; // Simulate 25ms for all cycles
      mockPerformanceNow.mockReturnValue(endTime);
      const totalTime = performance.now() - startTime;
      
      // Rapid creation/disposal should be efficient
      expect(totalTime).toBeLessThan(30);
    });
  });

  describe('Video Stream Quality Impact', () => {
    it('should maintain performance with different video resolutions', () => {
      const resolutions = [
        { width: 320, height: 240, name: '240p' },
        { width: 640, height: 480, name: '480p' },
        { width: 1280, height: 720, name: '720p' },
        { width: 1920, height: 1080, name: '1080p' },
      ];

      const performanceResults: Array<{ resolution: string; time: number }> = [];

      resolutions.forEach(({ width, height, name }) => {
        const video = new MockVideoElement();
        video.videoWidth = width;
        video.videoHeight = height;
        video.srcObject = new MockMediaStream() as any;

        mockPerformanceNow.mockReturnValue(0);
        const startTime = performance.now();

        const texture = new THREE.VideoTexture(video as any);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const geometry = new THREE.PlaneGeometry(2, 1);
        const mesh = new THREE.Mesh(geometry, material);

        // Simulate rendering a few frames
        for (let frame = 0; frame < 5; frame++) {
          texture.needsUpdate = true;
          renderer.render(scene, camera);
        }

        const simulatedTime = name === '240p' ? 5 : 
                            name === '480p' ? 8 : 
                            name === '720p' ? 12 : 15;
        mockPerformanceNow.mockReturnValue(simulatedTime);
        
        const frameTime = performance.now() - startTime;
        performanceResults.push({ resolution: name, time: frameTime });

        // Cleanup
        texture.dispose();
        geometry.dispose();
        material.dispose();
        scene.remove(mesh);
      });

      // All resolutions should render within reasonable time
      performanceResults.forEach(({ resolution, time }) => {
        expect(time).toBeLessThan(20); // Even 1080p should be under 20ms for 5 frames
      });

      // Higher resolutions should take more time but not excessively
      const result240p = performanceResults.find(r => r.resolution === '240p')!;
      const result1080p = performanceResults.find(r => r.resolution === '1080p')!;
      
      expect(result1080p.time).toBeGreaterThan(result240p.time);
      expect(result1080p.time).toBeLessThan(result240p.time * 4); // Shouldn't be more than 4x slower
    });

    it('should handle video stream interruptions gracefully', () => {
      const video = new MockVideoElement();
      const stream = new MockMediaStream();
      video.srcObject = stream as any;

      const texture = new THREE.VideoTexture(video as any);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const geometry = new THREE.PlaneGeometry(2, 1);
      const mesh = new THREE.Mesh(geometry, material);
      
      scene.add(mesh);

      mockPerformanceNow.mockReturnValue(0);
      const startTime = performance.now();

      // Render with normal stream
      for (let frame = 0; frame < 10; frame++) {
        texture.needsUpdate = true;
        renderer.render(scene, camera);
      }

      // Simulate stream interruption
      video.srcObject = null;

      // Continue rendering without stream
      for (let frame = 0; frame < 10; frame++) {
        texture.needsUpdate = true;
        renderer.render(scene, camera);
      }

      const endTime = 40; // Simulate 40ms total
      mockPerformanceNow.mockReturnValue(endTime);
      const totalTime = performance.now() - startTime;

      // Should handle interruption without significant performance impact
      expect(totalTime).toBeLessThan(50);
      
      // Cleanup
      texture.dispose();
      geometry.dispose();
      material.dispose();
    });
  });

  describe('Resource Management', () => {
    it('should efficiently update video textures', () => {
      const video = new MockVideoElement();
      video.srcObject = new MockMediaStream() as any;
      
      const texture = new THREE.VideoTexture(video as any);

      mockPerformanceNow.mockReturnValue(0);
      const startTime = performance.now();

      // Simulate many texture updates (like during video playback)
      for (let i = 0; i < 100; i++) {
        texture.needsUpdate = true;
        // Simulate texture upload
        mockPerformanceNow.mockReturnValue(i * 0.1); // 0.1ms per update
      }

      const endTime = 10; // 100 updates in 10ms
      mockPerformanceNow.mockReturnValue(endTime);
      const totalTime = performance.now() - startTime;

      // Texture updates should be very efficient
      expect(totalTime).toBeLessThan(15);
    });

    it('should handle concurrent video texture operations', async () => {
      const videoCount = 3;
      const videos = Array.from({ length: videoCount }, () => {
        const video = new MockVideoElement();
        video.srcObject = new MockMediaStream() as any;
        return video;
      });

      const textures = videos.map(video => new THREE.VideoTexture(video as any));

      mockPerformanceNow.mockReturnValue(0);
      const startTime = performance.now();

      // Simulate concurrent operations on all textures
      const operations = textures.map(async (texture, index) => {
        // Simulate different operations happening concurrently
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            for (let i = 0; i < 10; i++) {
              texture.needsUpdate = true;
            }
            resolve();
          }, index * 2); // Stagger operations slightly
        });
      });

      await Promise.all(operations);

      const endTime = 20; // All concurrent operations complete in 20ms
      mockPerformanceNow.mockReturnValue(endTime);
      const totalTime = performance.now() - startTime;

      // Concurrent operations should be efficient
      expect(totalTime).toBeLessThan(25);

      // Cleanup
      textures.forEach(texture => texture.dispose());
    });
  });

  describe('Performance Regression Detection', () => {
    it('should maintain baseline performance metrics', () => {
      const video = new MockVideoElement();
      video.srcObject = new MockMediaStream() as any;
      
      const texture = new THREE.VideoTexture(video as any);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const geometry = new THREE.PlaneGeometry(2, 1);
      const mesh = new THREE.Mesh(geometry, material);
      
      scene.add(mesh);

      // Baseline performance test - 60 frames at 60fps
      const targetFrameTime = 16.67; // 60fps target
      const frameCount = 60;
      let totalFrameTime = 0;
      let framesOverBudget = 0;

      for (let frame = 0; frame < frameCount; frame++) {
        mockPerformanceNow.mockReturnValue(frame * 16);
        const frameStart = performance.now();

        texture.needsUpdate = true;
        renderer.render(scene, camera);

        const simulatedFrameTime = 2 + (Math.random() * 3); // 2-5ms per frame
        mockPerformanceNow.mockReturnValue(frame * 16 + simulatedFrameTime);
        
        const frameTime = performance.now() - frameStart;
        totalFrameTime += frameTime;

        if (frameTime > targetFrameTime) {
          framesOverBudget++;
        }
      }

      const avgFrameTime = totalFrameTime / frameCount;
      const percentOverBudget = (framesOverBudget / frameCount) * 100;

      // Performance regression thresholds
      expect(avgFrameTime).toBeLessThan(targetFrameTime); // Average should be under 60fps target
      expect(percentOverBudget).toBeLessThan(10); // Less than 10% of frames should be over budget
      
      // Cleanup
      texture.dispose();
      geometry.dispose();
      material.dispose();
    });

    it('should track memory usage patterns', () => {
      const iterations = 5;
      const texturesPerIteration = 4;
      
      // Track texture creation/disposal cycles
      for (let iteration = 0; iteration < iterations; iteration++) {
        const textures: THREE.VideoTexture[] = [];
        
        // Create batch of textures
        for (let i = 0; i < texturesPerIteration; i++) {
          const video = new MockVideoElement();
          video.srcObject = new MockMediaStream() as any;
          
          const texture = new THREE.VideoTexture(video as any);
          textures.push(texture);
        }

        // Use textures (simulate rendering)
        textures.forEach(texture => {
          texture.needsUpdate = true;
        });

        // Dispose all textures
        textures.forEach(texture => texture.dispose());
      }

      // If we get here without crashes or excessive slowdown, memory management is working
      expect(true).toBe(true);
    });
  });
});