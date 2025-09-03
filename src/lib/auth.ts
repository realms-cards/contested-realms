import DiscordProvider from 'next-auth/providers/discord';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session({ session, user }: any) {
      if (session.user) {
        // Augment session with the user's id for server/client convenience
        (session.user as { id?: string }).id = user.id;
      }
      return session;
    },
  },
};

// Minimal shape we rely on across API routes
export type AppSession = { user?: { id: string } } | null;

export function getServerAuthSession(): Promise<AppSession> {
  // Casting to any here avoids TS incompatibilities between next-auth type re-exports and core types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getServerSession(authOptions as any) as unknown as Promise<AppSession>;
}
