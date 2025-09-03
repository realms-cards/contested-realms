"use client";

import { useSession } from "next-auth/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface AuthenticationWrapperProps {
  /** The content to render when user is authenticated */
  children: ReactNode;
  /** Custom loading message while authentication status is being checked */
  loadingMessage?: string;
  /** Custom message to show when user needs to sign in */
  signInMessage?: string;
  /** Optional CSS class for the loading container */
  loadingClassName?: string;
  /** Optional CSS class for the sign-in container */
  signInClassName?: string;
}

export default function AuthenticationWrapper({ 
  children, 
  loadingMessage = "Loading...",
  signInMessage = "You need to be signed in to access this page.",
  loadingClassName = "fixed inset-0 bg-slate-900 flex items-center justify-center",
  signInClassName = "fixed inset-0 bg-slate-900 flex items-center justify-center"
}: AuthenticationWrapperProps) {
  const { data: session, status } = useSession();
  const hasAuthedRef = useRef<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const router = useRouter();

  // Remember if the user has been authenticated at least once to avoid child unmounts on brief flickers
  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      hasAuthedRef.current = true;
    }
    // Debug logging for development
    if (process.env.NODE_ENV === 'development') {
      console.log('AuthWrapper state:', { 
        status, 
        hasUserId: !!session?.user?.id, 
        hasAuthed: hasAuthedRef.current 
      });
    }
  }, [status, session]);

  const handleSignIn = async (): Promise<void> => {
    try {
      setIsSigningIn(true);
      // Use custom sign-in page instead of default
      router.push('/auth/signin');
    } catch (error) {
      console.error('Sign-in navigation error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Show loading while session is being determined
  if (status === "loading") {
    return (
      <div className={loadingClassName}>
        <div className="text-center">
          <div className="text-white">{loadingMessage}</div>
        </div>
      </div>
    );
  }

  // If never authenticated and currently unauthenticated, block and prompt sign-in
  if (!hasAuthedRef.current && status === "unauthenticated") {
    return (
      <div className={signInClassName}>
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">Authentication Required</h2>
          <p className="text-gray-300 mb-6">{signInMessage}</p>
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors"
          >
            {isSigningIn ? 'Loading...' : 'Sign In'}
          </button>
        </div>
      </div>
    );
  }

  // Keep children mounted once authenticated; overlay status if session has briefly become unauthenticated
  const showOverlay = status !== "authenticated" && hasAuthedRef.current;
  const overlay = (
    <div className={showOverlay ? loadingClassName : "hidden"}>
      <div className="text-center">
        {status === "loading" ? (
          <div className="text-white">{loadingMessage}</div>
        ) : (
          <>
            <h2 className="text-2xl text-white mb-4">Session expired</h2>
            <p className="text-gray-300 mb-6">Please sign in again to continue.</p>
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors"
            >
              {isSigningIn ? 'Loading...' : 'Sign In'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {children}
      {showOverlay && overlay}
    </>
  );
}