"use client";

import { useSession } from "next-auth/react";
import { ReactNode } from "react";

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

  // Show loading while authentication is being checked
  if (status === "loading") {
    return (
      <div className={loadingClassName}>
        <div className="text-white">{loadingMessage}</div>
      </div>
    );
  }

  // Redirect to sign in if not authenticated
  if (status === "unauthenticated" || !session?.user) {
    return (
      <div className={signInClassName}>
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">Authentication Required</h2>
          <p className="text-gray-300 mb-6">{signInMessage}</p>
          <button
            onClick={() => {
              window.location.href = "/api/auth/signin";
            }}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Type guard - at this point we know user is authenticated
  return <>{children}</>;
}