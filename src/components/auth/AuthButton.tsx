'use client';

import { clsx } from 'clsx';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession, signOut, getProviders } from 'next-auth/react';
import type { LiteralUnion, ClientSafeProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';

type ProvidersType = Record<LiteralUnion<string, string>, ClientSafeProvider> | null;

type AuthButtonProps = {
  variant?: 'inline' | 'floating';
  className?: string;
};

export default function AuthButton({ variant = 'inline', className }: AuthButtonProps) {
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
    return (
      <div
        className={clsx(
          'h-9 animate-pulse rounded bg-slate-800/80',
          variant === 'floating' ? 'w-[7.5rem]' : 'w-24',
          className,
        )}
      />
    );
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

  const containerClasses = clsx('flex items-center gap-2', variant === 'floating' && 'justify-end', className);
  const buttonClasses = clsx(
    'inline-flex items-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
    variant === 'floating'
      ? 'rounded-full px-4 py-1.5 bg-slate-900/80 text-slate-100 ring-1 ring-white/15 shadow-lg shadow-black/40 backdrop-blur-sm hover:bg-slate-800/80'
      : 'rounded-md px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500',
  );

  return (
    <div className={containerClasses}>
      <button onClick={handleSignIn} className={buttonClasses}>
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
