import DiscordProvider from 'next-auth/providers/discord';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

// Build providers list, always include Discord and optionally 2FA test provider
const providers = [
  DiscordProvider({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  }),
  ...((process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_2FA === 'true')
    ? [
        CredentialsProvider({
          id: '2fa',
          name: '2FA (Test)',
          credentials: {
            code: { label: '2FA Code', type: 'text', placeholder: '424242' },
          },
          async authorize(credentials): Promise<User | null> {
            try {
              const submitted = credentials?.code?.trim();
              const expected = (process.env.TEST_2FA_CODE || '424242').trim();
              
              if (!submitted || submitted !== expected) {
                return null;
              }

              // Ensure a DB user exists so session creation doesn't violate FK constraints
              const dbUser = await prisma.user.upsert({
                where: { email: '2fa@example.com' },
                // For the test 2FA flow, always ensure a friendly name exists
                update: { 
                  name: 'Test 2FA User',
                  emailVerified: new Date() // Mark as verified for test user
                },
                create: { 
                  email: '2fa@example.com', 
                  name: 'Test 2FA User',
                  emailVerified: new Date()
                },
              });

              return {
                id: dbUser.id,
                name: dbUser.name || 'Test 2FA User',
                email: dbUser.email || '2fa@example.com',
                image: dbUser.image || null,
              };
            } catch (error) {
              console.error('2FA auth error:', error);
              return null;
            }
          },
        }),
      ]
    : []),
];

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, account }): Promise<JWT> {
      // Persist the user ID in the token right after signin
      if (user) {
        token.id = user.id;
      }
      // Persist the account info for provider-specific handling
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      if (session?.user && token) {
        // Use token.sub or token.id for the user ID
        const uid = token.id as string || token.sub;
        if (uid) {
          (session.user as { id?: string }).id = uid;
        }

        // Ensure the session exposes a display name for socket connections
        if (!session.user.name) {
          const inferredName =
            token.name as string ||
            (session.user.email ? session.user.email.split('@')[0] : undefined) ||
            'Player';
          (session.user as { name?: string }).name = inferredName;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  debug: process.env.NODE_ENV === 'development',
};

// Minimal shape we rely on across API routes
export type AppSession = { user?: { id: string } } | null;

export async function getServerAuthSession(): Promise<AppSession> {
  try {
    const session = await getServerSession(authOptions);
    return session;
  } catch (error) {
    console.error('Failed to get server auth session:', error);
    return null;
  }
}

