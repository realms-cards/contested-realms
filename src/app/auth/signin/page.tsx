'use client';

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useRouter, useSearchParams } from 'next/navigation';
import { getProviders, signIn, getSession } from 'next-auth/react';
import type { LiteralUnion, ClientSafeProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';

type ProvidersType = Record<LiteralUnion<string, string>, ClientSafeProvider> | null;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SignInPageProps {}

function SignInContent() {
  const [providers, setProviders] = useState<ProvidersType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPasskeyBusy, setIsPasskeyBusy] = useState<boolean>(false);
  const [registerDisplayName, setRegisterDisplayName] = useState<string>('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') || '/';
  const error = searchParams?.get('error');

  useEffect(() => {
    (async () => {
      try {
        // Check if already signed in
        const session = await getSession();
        if (session) {
          router.push(callbackUrl);
          return;
        }

        const res = await getProviders();
        setProviders(res);
      } catch (error) {
        console.error('Failed to load providers:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [callbackUrl, router]);

  const handleDiscordSignIn = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await signIn('discord', { callbackUrl });
    } catch (error) {
      console.error('Discord sign-in error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Passkey sign-in (authentication)
  const handlePasskeySignIn = async (): Promise<void> => {
    setIsPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const res = await fetch('/api/webauthn/authentication/options', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to get authentication options');
      const { options } = await res.json();
      const assertion = await startAuthentication(options);
      const result = await signIn('passkey', { assertion: JSON.stringify(assertion), callbackUrl, redirect: false });
      if (result?.ok) {
        router.push(callbackUrl);
      } else if (result?.error) {
        console.error('Passkey sign-in error:', result.error);
      }
    } catch (err) {
      console.error('Passkey sign-in failed:', err);
    } finally {
      setIsPasskeyBusy(false);
    }
  };

  const ensureDocumentFocus = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return true;
    }

    if (document.visibilityState === 'visible' && document.hasFocus()) {
      return true;
    }

    window.focus();

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(handleTimeout, 500);

      window.addEventListener('focus', onWindowFocus, { once: true });
      document.addEventListener('visibilitychange', onVisibilityChange);

      function resolveAndCleanup(result: boolean) {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onWindowFocus);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.clearTimeout(timeoutId);
        resolve(result);
      }

      function onWindowFocus() {
        resolveAndCleanup(true);
      }

      function onVisibilityChange() {
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          resolveAndCleanup(true);
        }
      }

      function handleTimeout() {
        resolveAndCleanup(document.hasFocus());
      }
    });
  };

  // Passkey registration flow
  const handlePasskeyRegistration = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const res = await fetch('/api/webauthn/registration/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: registerDisplayName }),
      });
      if (!res.ok) throw new Error('Failed to get registration options');
      const { options } = await res.json();

      const hasFocus = await ensureDocumentFocus();
      if (!hasFocus) {
        setPasskeyError('Focus this tab to finish passkey registration, then try again.');
        return;
      }

      const attestation = await startRegistration(options);
      const vr = await fetch('/api/webauthn/registration/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      });
      if (!vr.ok) throw new Error('Registration verification failed');
      await handlePasskeySignIn();
    } catch (err) {
      console.error('Passkey registration failed:', err);
      if (
        err instanceof DOMException &&
        err.name === 'NotAllowedError' &&
        /document is not focused/i.test(err.message)
      ) {
        setPasskeyError('Your browser blocked the prompt because this tab is unfocused. Click the app and try again.');
      } else if (err instanceof Error) {
        setPasskeyError(err.message || 'Passkey registration failed. Please try again.');
      } else {
        setPasskeyError('Passkey registration failed. Please try again.');
      }
    } finally {
      setIsPasskeyBusy(false);
    }
  };

  const handleTwoFactorSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const result = await signIn('2fa', {
        code: twoFactorCode,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        console.error('2FA sign-in error:', result.error);
        // Handle error (show message to user)
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (error) {
      console.error('2FA sign-in error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          Sign In to Sorcery Client
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-600 text-white rounded">
            <p className="text-sm">
              {error === 'CredentialsSignin' 
                ? 'Invalid 2FA code. Please try again.'
                : 'An error occurred during sign in. Please try again.'
              }
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Discord Provider */}
          {providers?.discord && (
            <button
              onClick={handleDiscordSignIn}
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center"
            >
              {isSubmitting ? (
                'Signing in...'
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Continue with Discord
                </>
              )}
            </button>
          )}

          {/* Passkey Sign-In */}
          <button
            onClick={handlePasskeySignIn}
            disabled={isPasskeyBusy}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-3 px-4 rounded transition-colors"
          >
            {isPasskeyBusy ? 'Working…' : 'Sign in with Passkey'}
          </button>

          {/* 2FA Provider (Development/Test) */}
          {providers?.['2fa'] && (
            <div className="border-t border-slate-600 pt-4">
              <p className="text-sm text-gray-400 mb-3 text-center">
                Development Testing
              </p>
              <form onSubmit={handleTwoFactorSignIn} className="space-y-3">
                <input
                  type="text"
                  value={twoFactorCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTwoFactorCode(e.target.value)}
                  placeholder="Enter 2FA Code (424242)"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !twoFactorCode.trim()}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                  {isSubmitting ? 'Signing in...' : 'Sign In with 2FA'}
                </button>
              </form>
            </div>
          )}

          {/* Passkey Registration */}
          <div className="border-t border-slate-600 pt-4">
            <p className="text-sm text-gray-400 mb-3 text-center">Register a Passkey</p>
            <form onSubmit={handlePasskeyRegistration} className="space-y-3">
              <input
                type="text"
                value={registerDisplayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegisterDisplayName(e.target.value)}
                placeholder="Display name (optional)"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                disabled={isPasskeyBusy}
              />
              {passkeyError && (
                <p className="text-sm text-red-400">
                  {passkeyError}
                </p>
              )}
              <button
                type="submit"
                disabled={isPasskeyBusy}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                {isPasskeyBusy ? 'Working…' : 'Register Passkey'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-xs text-gray-400 text-center">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage({}: SignInPageProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
