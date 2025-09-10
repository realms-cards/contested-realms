'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ErrorPageProps {}

const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration.',
  AccessDenied: 'You do not have permission to sign in.',
  Verification: 'The verification token has expired or has already been used.',
  OAuthSignin: 'Error in constructing an authorization URL.',
  OAuthCallback: 'Error in handling the response from an OAuth provider.',
  OAuthCreateAccount: 'Could not create OAuth account.',
  EmailCreateAccount: 'Could not create email account.',
  Callback: 'Error in the OAuth callback handler route.',
  OAuthAccountNotLinked: 'The account is not linked. Please try signing in with the account you originally used.',
  EmailSignin: 'Sending the e-mail with the verification token failed.',
  CredentialsSignin: 'Invalid credentials provided. Please check your input and try again.',
  SessionRequired: 'You must be signed in to view this page.',
  Default: 'An unexpected error occurred. Please try again.',
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  
  const errorMessage = errorMessages[error] || errorMessages.Default;

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 p-8 rounded-lg shadow-lg max-w-md w-full">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg 
              className="h-6 w-6 text-red-600" 
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth="1.5" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" 
              />
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-4">
            Authentication Error
          </h1>
          
          <p className="text-gray-300 mb-6">
            {errorMessage}
          </p>

          {error === 'OAuthAccountNotLinked' && (
            <div className="mb-6 p-4 bg-blue-900 border border-blue-700 rounded">
              <p className="text-sm text-blue-200">
                This usually happens when you try to sign in with a different provider 
                than the one you originally used. Please use the same provider you used 
                to create your account.
              </p>
            </div>
          )}

          {error === 'CredentialsSignin' && (
            <div className="mb-6 p-4 bg-yellow-900 border border-yellow-700 rounded">
              <p className="text-sm text-yellow-200">
                For the 2FA test provider, make sure you&apos;re using the correct code (default: 424242).
              </p>
            </div>
          )}
          
          <div className="space-y-3">
            <Link
              href="/auth/signin"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Try Again
            </Link>
            
            <Link
              href="/"
              className="block w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Go Home
            </Link>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-3 bg-slate-700 rounded text-left">
              <p className="text-xs text-gray-400 font-mono">
                Debug info: {error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ErrorPage({}: ErrorPageProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <ErrorContent />
    </Suspense>
  );
}