"use strict";

type ValueFactory<T = unknown> = (container: ServerContainer) => T;
type AsyncHook = () => void | Promise<void>;
type ConnectionHandler<TContext> = (ctx: TContext) => void;

export interface ServerContainer {
  registerValue<T = unknown>(name: string, value: T): T;
  registerFactory<T = unknown>(name: string, factory: ValueFactory<T>): void;
  resolve<T = unknown>(name: string): T;
  has(name: string): boolean;
  registerFeature<TFeature = unknown>(
    name: string,
    factory: (container: ServerContainer) => TFeature,
  ): TFeature;
  getFeature<TFeature = unknown>(name: string): TFeature | undefined;
  listFeatures(): string[];
  applyConnectionHandlers<TContext extends Record<string, unknown>>(
    context: TContext,
  ): void;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

interface FactoryRecord<T = unknown> {
  factory: ValueFactory<T>;
  instance: T | undefined;
  resolving: boolean;
}

export function createContainer(
  initialValues: Record<string, unknown> = {},
): ServerContainer {
  const values = new Map<string, unknown>(Object.entries(initialValues));
  const factories = new Map<string, FactoryRecord>();
  const features = new Map<string, unknown>();
  const connectionHandlers: Array<ConnectionHandler<Record<string, unknown>>> =
    [];
  const initHooks: AsyncHook[] = [];
  const shutdownHooks: AsyncHook[] = [];
  let initialized = false;
  let shuttingDown = false;

  function assertMutable(stage: "init" | "shutdown") {
    if (stage === "init" && initialized) {
      throw new Error("Container already initialized");
    }
    if (stage === "shutdown" && shuttingDown) {
      throw new Error("Container is shutting down");
    }
  }

  function registerValue<T>(name: string, value: T): T {
    if (!name || typeof name !== "string") {
      throw new Error("Container value name must be a non-empty string");
    }
    if (values.has(name) || factories.has(name)) {
      throw new Error(`Container value '${name}' already registered`);
    }
    values.set(name, value);
    return value;
  }

  function registerFactory<T>(name: string, factory: ValueFactory<T>): void {
    if (!name || typeof name !== "string") {
      throw new Error("Container factory name must be a non-empty string");
    }
    if (values.has(name) || factories.has(name)) {
      throw new Error(`Container entry '${name}' already registered`);
    }
    if (typeof factory !== "function") {
      throw new Error(`Factory for '${name}' must be a function`);
    }
    factories.set(name, { factory, instance: undefined, resolving: false });
  }

  function resolve<T>(name: string): T {
    if (values.has(name)) {
      return values.get(name) as T;
    }
    const record = factories.get(name);
    if (!record) {
      throw new Error(`Container entry '${name}' is not registered`);
    }
    if (record.instance !== undefined) {
      return record.instance as T;
    }
    if (record.resolving) {
      throw new Error(`Circular dependency detected while resolving '${name}'`);
    }
    record.resolving = true;
    try {
      const instance = record.factory(container);
      record.instance = instance;
      values.set(name, instance);
      factories.delete(name);
      return instance as T;
    } finally {
      record.resolving = false;
    }
  }

  function has(name: string): boolean {
    return values.has(name) || factories.has(name);
  }

  function registerFeature<TFeature>(
    name: string,
    factory: (container: ServerContainer) => TFeature,
  ): TFeature {
    if (!name || typeof name !== "string") {
      throw new Error("Feature name must be a non-empty string");
    }
    if (features.has(name)) {
      throw new Error(`Feature '${name}' already registered`);
    }
    if (typeof factory !== "function") {
      throw new Error(`Feature '${name}' factory must be a function`);
    }
    const feature = factory(container);
    features.set(name, feature);

    const maybeHandlers = feature as Partial<{
      registerSocketHandlers: ConnectionHandler<Record<string, unknown>>;
      onInit: AsyncHook;
      onShutdown: AsyncHook;
    }>;

    if (
      maybeHandlers &&
      typeof maybeHandlers.registerSocketHandlers === "function"
    ) {
      const registerSocketHandlers = maybeHandlers.registerSocketHandlers;
      connectionHandlers.push((ctx) => {
        try {
          registerSocketHandlers(ctx);
        } catch (err) {
          try {
            console.warn(
              `[container] Feature '${name}' connection handler failed:`,
              err instanceof Error ? err.message : err,
            );
          } catch {
            // noop
          }
        }
      });
    }

    if (maybeHandlers && typeof maybeHandlers.onInit === "function") {
      const onInit = maybeHandlers.onInit;
      initHooks.push(() => onInit());
    }

    if (maybeHandlers && typeof maybeHandlers.onShutdown === "function") {
      const onShutdown = maybeHandlers.onShutdown;
      shutdownHooks.push(() => onShutdown());
    }

    return feature;
  }

  function getFeature<TFeature>(name: string): TFeature | undefined {
    return features.get(name) as TFeature | undefined;
  }

  function listFeatures(): string[] {
    return Array.from(features.keys());
  }

  function applyConnectionHandlers<TContext extends Record<string, unknown>>(
    context: TContext,
  ): void {
    for (const handler of connectionHandlers) {
      try {
        handler(context);
      } catch (err) {
        try {
          console.warn(
            "[container] Failed to apply connection handler:",
            err instanceof Error ? err.message : err,
          );
        } catch {
          // noop
        }
      }
    }
  }

  async function initialize(): Promise<void> {
    assertMutable("init");
    for (const hook of initHooks) {
      await hook();
    }
    initialized = true;
  }

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const hook of shutdownHooks.reverse()) {
      try {
        await hook();
      } catch (err) {
        try {
          console.warn(
            "[container] Shutdown hook failed:",
            err instanceof Error ? err.message : err,
          );
        } catch {
          // noop
        }
      }
    }
  }

  const container: ServerContainer = {
    registerValue,
    registerFactory,
    resolve,
    has,
    registerFeature,
    getFeature,
    listFeatures,
    applyConnectionHandlers,
    initialize,
    shutdown,
  };

  return container;
}
