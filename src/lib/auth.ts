import { PrismaAdapter } from '@auth/prisma-adapter';
import { verifyAuthenticationResponse, type VerifyAuthenticationResponseOpts } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/types';
import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { getServerSession } from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';
import DiscordProvider from 'next-auth/providers/discord';
import { prisma } from '@/lib/prisma';

// Build providers list, always include Discord and optionally 2FA test provider
function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = decodeURIComponent(p.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function b64urlToBuffer(b64url: string): Buffer {
  return Buffer.from(b64url, 'base64url');
}

function parseTransportsCsv(csv: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined;
  const valid: AuthenticatorTransportFuture[] = [
    'usb',
    'nfc',
    'ble',
    'internal',
    'cable',
    'hybrid',
    'smart-card',
  ];
  const items = csv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const mapped: AuthenticatorTransportFuture[] = [];
  for (const s of items) {
    if ((valid as unknown as string[]).includes(s)) {
      mapped.push(s as AuthenticatorTransportFuture);
    }
  }
  return mapped.length ? mapped : undefined;
}

const providers = [
  DiscordProvider({
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  }),
  CredentialsProvider({
    id: 'passkey',
    name: 'Passkey',
    credentials: {
      assertion: { label: 'WebAuthn Assertion', type: 'text' },
    },
    async authorize(credentials, req): Promise<User | null> {
      try {
        const assertionRaw = credentials?.assertion;
        if (!assertionRaw) return null;
        const assertion: AuthenticationResponseJSON = JSON.parse(assertionRaw);

        // Expected values
        const expectedRPID = process.env.WEB_AUTHN_RP_ID || 'localhost';
        const expectedOrigin = process.env.WEB_AUTHN_ORIGIN || process.env.NEXTAUTH_URL || 'http://localhost:3000';

        // Retrieve server-saved challenge from cookie
        const cookieHeader = (req as unknown as { headers?: Record<string, string> })?.headers?.cookie
          || (req as unknown as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.('cookie')
          || '';
        const cookies = parseCookies(cookieHeader);
        const expectedChallenge = cookies['wa_chal'];
        if (!expectedChallenge) {
          return null;
        }

        // Find authenticator by credential ID
        const credId = b64urlToBuffer(assertion.id);
        const cred = await prisma.passkeyCredential.findUnique({ where: { credentialId: credId } });
        if (!cred) return null;

        const opts: VerifyAuthenticationResponseOpts = {
          response: assertion,
          expectedChallenge,
          expectedOrigin,
          expectedRPID,
          authenticator: {
            counter: cred.counter,
            credentialID: Buffer.from(cred.credentialId),
            credentialPublicKey: Buffer.from(cred.publicKey),
            transports: parseTransportsCsv(cred.transports),
          },
          requireUserVerification: false,
        };

        const verification = await verifyAuthenticationResponse(opts);
        if (!verification.verified) return null;

        // Update counter & lastUsed
        try {
          await prisma.passkeyCredential.update({
            where: { id: cred.id },
            data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
          });
        } catch {}

        // Return the associated user
        const dbUser = await prisma.user.findUnique({ where: { id: cred.userId } });
        if (!dbUser) return null;
        return {
          id: dbUser.id,
          name: dbUser.name || 'Player',
          email: dbUser.email,
          image: dbUser.image,
        };
      } catch (error) {
        console.error('Passkey auth error:', error);
        return null;
      }
    },
  }),
  ...((process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_2FA === 'true')
    ? [
        CredentialsProvider({
          id: '2fa',
          name: '2FA (Test)',
          credentials: {
            code: { label: '2FA Code', type: 'text', placeholder: '111111, 222222, 333333, 444444, 555555, 666666, 777777, 888888' },
          },
          async authorize(credentials): Promise<User | null> {
            try {
              const submitted = credentials?.code?.trim();
              
              // Define multiple test users with different codes
              const testUsers = [
                { code: '111111', email: 'player1@example.com', name: 'Alice' },
                { code: '222222', email: 'player2@example.com', name: 'Bob' },
                { code: '333333', email: 'player3@example.com', name: 'Charlie' },
                { code: '444444', email: 'player4@example.com', name: 'Diana' },
                { code: '555555', email: 'player5@example.com', name: 'Eve' },
                { code: '666666', email: 'player6@example.com', name: 'Frank' },
                { code: '777777', email: 'player7@example.com', name: 'Grace' },
                { code: '888888', email: 'player8@example.com', name: 'Henry' },
              ];
              
              // Find matching test user
              const testUser = testUsers.find(user => user.code === submitted);
              if (!testUser) {
                return null;
              }

              // Ensure a DB user exists so session creation doesn't violate FK constraints
              const dbUser = await prisma.user.upsert({
                where: { email: testUser.email },
                // For the test 2FA flow, always ensure a friendly name exists
                update: { 
                  name: testUser.name,
                  emailVerified: new Date() // Mark as verified for test user
                },
                create: { 
                  email: testUser.email, 
                  name: testUser.name,
                  emailVerified: new Date()
                },
              });

              return {
                id: dbUser.id,
                name: dbUser.name || testUser.name,
                email: dbUser.email || testUser.email,
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
      // Ensure user record exists in database for all providers when using JWT strategy
      if (user && account) {
        try {
          // For non-credentials providers, ensure user exists in database
          if (account.provider !== '2fa' && account.provider !== 'passkey') {
            const dbUser = await prisma.user.upsert({
              where: { 
                email: user.email || `${account.providerAccountId}@${account.provider}.local` 
              },
              update: { 
                name: user.name,
                image: user.image,
              },
              create: { 
                email: user.email || `${account.providerAccountId}@${account.provider}.local`,
                name: user.name || `User ${account.providerAccountId}`,
                image: user.image,
                emailVerified: user.email ? new Date() : null,
              },
            });
            token.id = dbUser.id;
          } else {
            // For credentials providers (2fa, passkey), user.id is already set from authorize
            token.id = user.id;
          }
        } catch (error) {
          console.error('Error ensuring user exists:', error);
          token.id = user.id; // Fallback to provided user ID
        }
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

