'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';

type AuthProviderProps = {
  children: React.ReactNode;
  session?: Session | null;
};

export default function AuthProvider({ children, session }: AuthProviderProps) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}
