'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="w-24 h-9 bg-slate-800 rounded animate-pulse" />;
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        {session.user?.image && (
          <Image
            src={session.user.image}
            alt={session.user.name || 'User avatar'}
            width={32}
            height={32}
            className="rounded-full"
          />
        )}
        <span className="text-sm font-medium text-slate-200">{session.user?.name}</span>
        <button
          onClick={() => signOut()}
          className="px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn('discord')}
      className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 transition-colors"
    >
      Sign In with Discord
    </button>
  );
}
