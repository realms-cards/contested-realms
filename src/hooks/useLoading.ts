import { useCallback, useEffect, useRef } from "react";
import { useLoadingContext } from "@/lib/contexts/LoadingContext";

/**
 * Hook for manual loading state control with automatic cleanup
 *
 * Provides imperative API for triggering loading indicator during async operations.
 * Automatically decrements reference count on component unmount to prevent stuck indicators.
 *
 * @returns Object with isLoading state and control functions
 *
 * @example
 * ```tsx
 * function TournamentForm() {
 *   const { startLoading, stopLoading, isLoading } = useLoading();
 *
 *   async function handleSubmit() {
 *     startLoading();
 *     try {
 *       await api.createTournament(...);
 *     } finally {
 *       stopLoading();
 *     }
 *   }
 *
 *   return (
 *     <button onClick={handleSubmit} disabled={isLoading}>
 *       Create Tournament
 *     </button>
 *   );
 * }
 * ```
 */
export function useLoading() {
  const context = useLoadingContext();
  const loadingCountRef = useRef(0);

  // Automatic cleanup on unmount
  useEffect(() => {
    return () => {
      // Decrement reference count for any unclosed loading operations
      for (let i = 0; i < loadingCountRef.current; i++) {
        context.stopLoading();
      }
    };
  }, [context]);

  const startLoading = useCallback(() => {
    loadingCountRef.current += 1;
    context.startLoading();
  }, [context]);

  const stopLoading = useCallback(() => {
    if (loadingCountRef.current > 0) {
      loadingCountRef.current -= 1;
      context.stopLoading();
    }
  }, [context]);

  return {
    isLoading: context.isLoading,
    startLoading,
    stopLoading,
  };
}
