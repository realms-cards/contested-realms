type ConnectionHandler<TContext> = (ctx: TContext) => void;

export interface FeatureRegistry<TContext> {
  registerFeature<TFeature, TDeps>(
    name: string,
    factory: (deps: TDeps) => TFeature,
    deps: TDeps,
  ): TFeature;
  getFeature<TFeature = unknown>(name: string): TFeature | undefined;
  listFeatures(): string[];
  applyConnectionHandlers(ctx: TContext): void;
}

export function createFeatureRegistry<
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(): FeatureRegistry<TContext> {
  const features = new Map<string, unknown>();
  const connectionHandlers: Array<ConnectionHandler<TContext>> = [];

  function registerFeature<TFeature, TDeps>(
    name: string,
    factory: (deps: TDeps) => TFeature,
    deps: TDeps,
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
    const feature = factory(deps);
    features.set(name, feature);

    const maybeRegistrable = feature as Partial<{
      registerSocketHandlers: (context: TContext) => void;
    }>;
    if (
      feature &&
      typeof maybeRegistrable.registerSocketHandlers === "function"
    ) {
      const registerSocketHandlers = maybeRegistrable.registerSocketHandlers;
      connectionHandlers.push((ctx: TContext) => {
        registerSocketHandlers(ctx);
      });
    }

    return feature;
  }

  function getFeature<TFeature = unknown>(name: string): TFeature | undefined {
    return features.get(name) as TFeature | undefined;
  }

  function listFeatures(): string[] {
    return Array.from(features.keys());
  }

  function applyConnectionHandlers(ctx: TContext): void {
    for (const handler of connectionHandlers) {
      try {
        handler(ctx);
      } catch (err) {
        try {
          console.warn(
            "[feature-registry] Failed to apply connection handler:",
            err instanceof Error ? err.message : err,
          );
        } catch {
          // noop
        }
      }
    }
  }

  return {
    registerFeature,
    getFeature,
    listFeatures,
    applyConnectionHandlers,
  };
}
