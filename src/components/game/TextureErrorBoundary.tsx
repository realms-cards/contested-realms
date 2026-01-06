"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Error boundary specifically for catching texture/3D loading failures.
 * When a texture fails to load (e.g., on Xbox browser or limited WebGL),
 * this prevents the entire scene from crashing and renders a fallback instead.
 */
export class TextureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to help debug texture loading issues
    if (process.env.NODE_ENV !== "production") {
      console.warn("[TextureErrorBoundary] Caught error:", error.message);
      console.warn(
        "[TextureErrorBoundary] Component stack:",
        info.componentStack
      );
    }
    this.props.onError?.(error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

export default TextureErrorBoundary;
