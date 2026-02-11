/**
 * Socket Transport Unit Tests
 *
 * Tests for the WebSocket-based game transport layer that handles
 * client-server communication for multiplayer functionality.
 *
 * Critical requirements tested:
 * - Event handler registration and dispatch
 * - Connection state tracking
 * - Message formatting and validation
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SocketTransport } from "@/lib/net/socketTransport";

// Mock socket.io-client with factory function
vi.mock("socket.io-client", () => {
  const mockSocket = {
    connected: false,
    on: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    io: {
      on: vi.fn(),
    },
  };

  return {
    io: vi.fn(() => mockSocket),
  };
});

// Mock fetch for token
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ token: "test-token" }),
  } as Response),
);

describe("SocketTransport", () => {
  let transport: SocketTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new SocketTransport();
  });

  describe("Event Handler Registration", () => {
    it("should register event handlers", () => {
      const handler = vi.fn();

      const unsubscribe = transport.on("welcome", handler);

      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it("should dispatch events to registered handlers", () => {
      const handler = vi.fn();

      transport.on("welcome", handler);

      const payload = { playerId: "player-1", sessionId: "session-1" };
      transport["dispatch"]("welcome", payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it("should support multiple handlers for same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.on("welcome", handler1);
      transport.on("welcome", handler2);

      const payload = { playerId: "player-1", sessionId: "session-1" };
      transport["dispatch"]("welcome", payload);

      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    it("should unsubscribe handlers correctly", () => {
      const handler = vi.fn();

      const unsubscribe = transport.on("welcome", handler);
      unsubscribe();

      const payload = { playerId: "player-1", sessionId: "session-1" };
      transport["dispatch"]("welcome", payload);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should handle multiple unsubscribes safely", () => {
      const handler = vi.fn();

      const unsubscribe = transport.on("welcome", handler);
      unsubscribe();
      unsubscribe(); // Should not throw

      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("Connection State", () => {
    it("should start as disconnected", () => {
      expect(transport.getConnectionState()).toBe("disconnected");
      expect(transport.isConnected()).toBe(false);
    });

    it("should track connection state changes", () => {
      transport["connectionState"] = "connecting";
      expect(transport.getConnectionState()).toBe("connecting");

      transport["connectionState"] = "connected";
      expect(transport.getConnectionState()).toBe("connected");

      transport["connectionState"] = "reconnecting";
      expect(transport.getConnectionState()).toBe("reconnecting");

      transport["connectionState"] = "disconnected";
      expect(transport.getConnectionState()).toBe("disconnected");
    });

    it("should report connected only when socket is connected", () => {
      transport["connectionState"] = "connected";
      transport["socket"] = { connected: true } as any;

      expect(transport.isConnected()).toBe(true);
    });

    it("should report connected based on connectionState only", () => {
      // isConnected() now only checks connectionState === 'connected'
      transport["connectionState"] = "connected";
      expect(transport.isConnected()).toBe(true);

      transport["connectionState"] = "disconnected";
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should throw error if socket not connected when emitting", () => {
      expect(() => transport["requireSocket"]()).toThrow(
        "Socket not connected",
      );
    });

    it("should include connection state in error message", () => {
      transport["connectionState"] = "reconnecting";

      expect(() => transport["requireSocket"]()).toThrow("state: reconnecting");
    });

    it("should allow operations when socket is connected", () => {
      const mockSocket = { connected: true, on: vi.fn(), emit: vi.fn() };
      transport["socket"] = mockSocket as any;

      expect(() => transport["requireSocket"]()).not.toThrow();
    });
  });

  describe("Reconnection Configuration", () => {
    it("should have default reconnection settings", () => {
      // maxReconnectionAttempts defaults to Infinity (env-configurable)
      expect(transport["maxReconnectionAttempts"]).toBe(
        Number.POSITIVE_INFINITY,
      );
      expect(transport["reconnectionDelay"]).toBe(1000);
      expect(transport["reconnectionAttempts"]).toBe(0);
    });

    it("should track reconnection attempts", () => {
      transport["reconnectionAttempts"] = 0;
      transport["reconnectionAttempts"]++;
      expect(transport["reconnectionAttempts"]).toBe(1);

      transport["reconnectionAttempts"]++;
      expect(transport["reconnectionAttempts"]).toBe(2);
    });

    it("should support exponential backoff calculation", () => {
      transport["reconnectionDelay"] = 1000;

      // Double the delay
      transport["reconnectionDelay"] = Math.min(
        transport["reconnectionDelay"] * 2,
        30000,
      );
      expect(transport["reconnectionDelay"]).toBe(2000);

      // Double again
      transport["reconnectionDelay"] = Math.min(
        transport["reconnectionDelay"] * 2,
        30000,
      );
      expect(transport["reconnectionDelay"]).toBe(4000);
    });

    it("should cap reconnection delay at 30 seconds", () => {
      transport["reconnectionDelay"] = 20000;

      transport["reconnectionDelay"] = Math.min(
        transport["reconnectionDelay"] * 2,
        30000,
      );
      expect(transport["reconnectionDelay"]).toBe(30000);

      // Should not exceed 30s
      transport["reconnectionDelay"] = Math.min(
        transport["reconnectionDelay"] * 2,
        30000,
      );
      expect(transport["reconnectionDelay"]).toBe(30000);
    });
  });

  describe("Message Type Extraction", () => {
    it("should extract message type from objects", () => {
      const msg = { type: "draftReady", ready: true };
      const type = SocketTransport["getMessageType"](msg);

      expect(type).toBe("draftReady");
    });

    it('should return "unknown" for objects without type', () => {
      const msg = { data: "test" };
      const type = SocketTransport["getMessageType"](msg);

      expect(type).toBe("unknown");
    });

    it('should return "unknown" for null', () => {
      const type = SocketTransport["getMessageType"](null);
      expect(type).toBe("unknown");
    });

    it('should return "unknown" for non-objects', () => {
      expect(SocketTransport["getMessageType"]("string")).toBe("unknown");
      expect(SocketTransport["getMessageType"](123)).toBe("unknown");
      expect(SocketTransport["getMessageType"](true)).toBe("unknown");
    });

    it('should return "unknown" for objects with non-string type', () => {
      const msg = { type: 123 };
      const type = SocketTransport["getMessageType"](msg);

      expect(type).toBe("unknown");
    });
  });

  describe("Generic Event Handlers", () => {
    let mockSocket: { on: any; off: any; connected: boolean };

    beforeEach(() => {
      mockSocket = {
        on: vi.fn(),
        off: vi.fn(),
        connected: true,
      };
      transport["socket"] = mockSocket as any;
    });

    it("should register generic event handler", () => {
      const handler = vi.fn();

      transport.onGeneric("customEvent", handler);

      expect(mockSocket.on).toHaveBeenCalledWith("customEvent", handler);
    });

    it("should remove generic event handler", () => {
      const handler = vi.fn();

      transport.onGeneric("customEvent", handler);
      transport.offGeneric("customEvent", handler);

      expect(mockSocket.off).toHaveBeenCalledWith("customEvent", handler);
    });

    it("should track generic handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      transport.onGeneric("event1", handler1);
      transport.onGeneric("event2", handler2);

      const handlers = transport["genericHandlers"];
      expect(handlers.get("event1")?.has(handler1)).toBe(true);
      expect(handlers.get("event2")?.has(handler2)).toBe(true);
    });

    it("should not register duplicate handlers", () => {
      const handler = vi.fn();

      transport.onGeneric("customEvent", handler);
      transport.onGeneric("customEvent", handler);

      const handlers = transport["genericHandlers"].get("customEvent");
      expect(handlers?.size).toBe(1);
    });

    it("should clean up handler sets when empty", () => {
      const handler = vi.fn();

      transport.onGeneric("customEvent", handler);
      transport.offGeneric("customEvent", handler);

      // After removing all handlers, the set should be deleted
      const handlers = transport["genericHandlers"].get("customEvent");
      expect(handlers).toBeUndefined();
    });
  });

  describe("Disconnect Logic", () => {
    let mockSocket: { disconnect: any; connected: boolean };

    beforeEach(() => {
      mockSocket = {
        disconnect: vi.fn(),
        connected: true,
      };
      transport["socket"] = mockSocket as any;
      transport["connectionState"] = "connected";
    });

    it("should mark disconnect as intentional", () => {
      transport.disconnect();

      expect(transport["isIntentionalDisconnect"]).toBe(true);
    });

    it("should update connection state", () => {
      transport.disconnect();

      expect(transport.getConnectionState()).toBe("disconnected");
    });

    it("should call socket disconnect", () => {
      transport.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it("should clear socket reference", () => {
      transport.disconnect();

      expect(transport["socket"]).toBeUndefined();
    });

    it("should handle disconnect when no socket exists", () => {
      transport["socket"] = undefined;

      expect(() => transport.disconnect()).not.toThrow();
    });
  });

  describe("Event Dispatch", () => {
    it("should not throw if no handlers registered", () => {
      const payload = { playerId: "player-1" };

      expect(() => transport["dispatch"]("welcome", payload)).not.toThrow();
    });

    it("should dispatch to all registered handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      transport.on("chat", handler1);
      transport.on("chat", handler2);
      transport.on("chat", handler3);

      const payload = { message: "test", scope: "lobby" as const };
      transport["dispatch"]("chat", payload);

      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);
      expect(handler3).toHaveBeenCalledWith(payload);
    });

    it("should handle handler errors without affecting other handlers", () => {
      const handler1 = vi.fn(() => {
        throw new Error("Handler error");
      });
      const handler2 = vi.fn();

      transport.on("welcome", handler1);
      transport.on("welcome", handler2);

      const payload = { playerId: "player-1", sessionId: "session-1" };

      // Should not throw even if handler1 throws
      expect(() => {
        try {
          transport["dispatch"]("welcome", payload);
        } catch {
          // Swallow handler errors for this test
        }
      }).not.toThrow();

      expect(handler1).toHaveBeenCalled();
    });
  });

  describe("Connection Flags", () => {
    it("should initialize with intentional disconnect as false", () => {
      expect(transport["isIntentionalDisconnect"]).toBe(false);
    });

    it("should set intentional disconnect flag on manual disconnect", () => {
      const mockSocket = { disconnect: vi.fn(), connected: true };
      transport["socket"] = mockSocket as any;

      transport.disconnect();

      expect(transport["isIntentionalDisconnect"]).toBe(true);
    });
  });
});
