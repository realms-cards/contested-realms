'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession, signOut, getProviders } from 'next-auth/react';
import type { LiteralUnion, ClientSafeProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';

type ProvidersType = Record<LiteralUnion<string, string>, ClientSafeProvider> | null;

export default function AuthButton() {
  const { data: session, status } = useSession();
  const [providers, setProviders] = useState<ProvidersType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    
    const loadProviders = async (): Promise<void> => {
      try {
        const ps = await getProviders();
        if (mounted) {
          setProviders(ps);
        }
      } catch (error) {
        console.error('Failed to load providers:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadProviders();
    
    return () => {
      mounted = false;
    };
  }, []);

  const handleSignIn = (): void => {
    router.push('/auth/signin');
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut({ callbackUrl: '/' });
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  if (status === 'loading' || isLoading) {
    return <div className="w-24 h-9 bg-slate-800 rounded animate-pulse" />;
  }

  if (session?.user?.id) {
    return (
      <div className="flex items-center gap-3">
        {session.user.image && (
          <Image
            src={session.user.image}
            alt={session.user.name || 'User avatar'}
            width={32}
            height={32}
            className="rounded-full"
          />
        )}
        <span className="text-sm font-medium text-slate-200">
          {session.user.name || 'User'}
        </span>
        <button
          onClick={handleSignOut}
          className="px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSignIn}
        className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 transition-colors"
      >
        Sign In
      </button>
      {providers?.['2fa'] && process.env.NODE_ENV === 'development' && (
        <span className="text-xs text-gray-400">
          (2FA Test Available)
        </span>
      )}
    </div>
  );
}
