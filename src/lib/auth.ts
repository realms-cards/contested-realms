import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";
import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import EmailProvider from "next-auth/providers/email";
import type { SendVerificationRequestParams } from "next-auth/providers/email";
import { createTransport } from "nodemailer";
import { prisma } from "@/lib/prisma";

// Build providers list, always include Discord and optionally 2FA test provider
function parseCookies(
  header: string | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = decodeURIComponent(p.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function b64urlToBuffer(b64url: string): Buffer {
  return Buffer.from(b64url, "base64url");
}

function parseTransportsCsv(
  csv: string | null | undefined
): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined;
  const valid: AuthenticatorTransportFuture[] = [
    "usb",
    "nfc",
    "ble",
    "internal",
    "cable",
    "hybrid",
    "smart-card",
  ];
  const items = csv
    .split(",")
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

function sanitizeUserImage(image: string | null | undefined): string | null {
  if (!image) return null;
  if (image.startsWith("data:")) {
    return null;
  }
  if (image.length > 1024) {
    return null;
  }
  return image;
}

const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;

if (!discordClientId || !discordClientSecret) {
  throw new Error("Discord OAuth credentials are not configured");
}

const emailFrom = process.env.EMAIL_FROM;
const emailServer = process.env.EMAIL_SERVER;

if (!emailFrom || !emailServer) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "EMAIL_FROM and EMAIL_SERVER are not fully configured; email magic links will be disabled."
    );
  }
}

async function sendMagicLinkEmail({
  identifier,
  url,
  provider,
  theme,
}: SendVerificationRequestParams): Promise<void> {
  const transport = createTransport(provider.server);
  const brandColor = theme?.brandColor || "#7c3aed";
  const buttonTextColor = theme?.buttonText || "#ffffff";
  const backgroundColor = "#0f172a";
  const previewText = "Use this link to finish signing in to Realms.cards";
  const subject = "Realms.cards — Your secure sign-in link";
  const text = `Welcome to Realms.cards - your fan simulator for Sorcery: Contested Realm!

Your one-time sign-in link is ready:
${url}

This link expires in 24 hours. If you did not request it, you can safely ignore this email.

I shall meet you on the battlegrounds,
King Arthur

(this is an automated message, please do not reply)`;

  const escapedUrl = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Realms.cards Sign-in</title>
  </head>
  <body style="margin:0;padding:0;background:${backgroundColor};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${backgroundColor};padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="background:#111827;border-radius:16px;padding:32px;text-align:left;">
            <tr>
              <td style="font-size:28px;font-weight:700;color:#f8fafc;">Welcome to Realms.cards - your fan simulator for Sorcery: Contested Realm!</td>
            </tr>
            <tr>
              <td style="padding-top:12px;font-size:15px;line-height:1.6;color:#cbd5f5;">
                Use the secure button below to finish signing in.
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;padding-bottom:32px;">
                <a clicktracking="off" href="${escapedUrl}" style="display:inline-block;padding:14px 28px;background:${brandColor};color:${buttonTextColor};text-decoration:none;border-radius:12px;font-weight:600;">Complete sign-in</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.6;color:#94a3b8;">
                Link expires in 24 hours. If you didn’t request this, you can ignore this message.
              </td>
            </tr>
          </table>
          <p style="margin-top:16px;font-size:12px;color:#475569;">Do not reply, this is an automated message. Sent securely from Realms.cards • ${previewText}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    await transport.sendMail({
      to: identifier,
      from: provider.from,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("Failed to send magic link email:", error);
    throw error;
  }
}

const providers = [
  ...(emailFrom && emailServer
    ? [
        EmailProvider({
          from: emailFrom,
          server: emailServer,
          maxAge: 60 * 60 * 24, // 24 hours
          sendVerificationRequest: sendMagicLinkEmail,
        }),
      ]
    : []),
  DiscordProvider({
    clientId: discordClientId,
    clientSecret: discordClientSecret,
  }),
  CredentialsProvider({
    id: "passkey",
    name: "Passkey",
    credentials: {
      assertion: { label: "WebAuthn Assertion", type: "text" },
    },
    async authorize(credentials, req): Promise<User | null> {
      try {
        const assertionRaw = credentials?.assertion;
        if (!assertionRaw) return null;
        const assertion: AuthenticationResponseJSON = JSON.parse(assertionRaw);

        // Expected values
        const expectedRPID = process.env.WEB_AUTHN_RP_ID || "localhost";
        const expectedOrigin =
          process.env.WEB_AUTHN_ORIGIN ||
          process.env.NEXTAUTH_URL ||
          "http://localhost:3000";

        // Retrieve server-saved challenge from cookie
        const cookieHeader =
          (req as unknown as { headers?: Record<string, string> })?.headers
            ?.cookie ||
          (
            req as unknown as {
              headers?: { get?: (k: string) => string | null };
            }
          )?.headers?.get?.("cookie") ||
          "";
        const cookies = parseCookies(cookieHeader);
        const expectedChallenge = cookies["wa_chal"];
        if (!expectedChallenge) {
          return null;
        }

        // Find authenticator by credential ID
        const credId = b64urlToBuffer(assertion.id);
        const cred = await prisma.passkeyCredential.findUnique({
          where: { credentialId: credId },
        });
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
            data: {
              counter: verification.authenticationInfo.newCounter,
              lastUsedAt: new Date(),
            },
          });
        } catch {}

        // Return the associated user
        const dbUser = await prisma.user.findUnique({
          where: { id: cred.userId },
        });
        if (!dbUser) return null;
        return {
          id: dbUser.id,
          name: dbUser.name || "Player",
          email: dbUser.email,
          image: dbUser.image,
        };
      } catch (error) {
        console.error("Passkey auth error:", error);
        return null;
      }
    },
  }),
  ...(process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_TEST_2FA === "true"
    ? [
        CredentialsProvider({
          id: "2fa",
          name: "2FA (Test)",
          credentials: {
            code: {
              label: "2FA Code",
              type: "text",
              placeholder:
                "111111, 222222, 333333, 444444, 555555, 666666, 777777, 888888",
            },
          },
          async authorize(credentials): Promise<User | null> {
            try {
              const submitted = credentials?.code?.trim();

              // Define multiple test users with different codes
              const testUsers = [
                { code: "111111", email: "player1@example.com", name: "Alice" },
                { code: "222222", email: "player2@example.com", name: "Bob" },
                {
                  code: "333333",
                  email: "player3@example.com",
                  name: "Charlie",
                },
                { code: "444444", email: "player4@example.com", name: "Diana" },
                { code: "555555", email: "player5@example.com", name: "Eve" },
                { code: "666666", email: "player6@example.com", name: "Frank" },
                { code: "777777", email: "player7@example.com", name: "Grace" },
                { code: "888888", email: "player8@example.com", name: "Henry" },
              ];

              // Find matching test user
              const testUser = testUsers.find(
                (user) => user.code === submitted
              );
              if (!testUser) {
                return null;
              }

              // Ensure a DB user exists so session creation doesn't violate FK constraints
              const dbUser = await prisma.user.upsert({
                where: { email: testUser.email },
                // For the test 2FA flow, always ensure a friendly name exists
                update: {
                  name: testUser.name,
                  emailVerified: new Date(), // Mark as verified for test user
                },
                create: {
                  email: testUser.email,
                  name: testUser.name,
                  emailVerified: new Date(),
                },
              });

              return {
                id: dbUser.id,
                name: dbUser.name || testUser.name,
                email: dbUser.email || testUser.email,
                image: dbUser.image || null,
              };
            } catch (error) {
              console.error("2FA auth error:", error);
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
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account, trigger, session }): Promise<JWT> {
      // Merge client-side session updates (e.g., name/image) into the JWT
      if (trigger === "update" && session) {
        try {
          if (typeof (session as Record<string, unknown>).name === "string") {
            token.name = (session as Record<string, string>).name;
          }
          const nextImageRaw = (session as Record<string, unknown>).image;
          if (typeof nextImageRaw === "string" || nextImageRaw === null) {
            const nextImage = sanitizeUserImage(nextImageRaw);
            (token as Record<string, unknown>).picture = nextImage ?? undefined;
            (token as Record<string, unknown>).image = nextImage ?? undefined;
          }
          const nextEmail = (session as Record<string, unknown>).email;
          if (typeof nextEmail === "string" || nextEmail === null) {
            token.email = nextEmail === null ? null : nextEmail;
          }
        } catch {}
      }
      // Ensure user record exists in database for all providers when using JWT strategy
      if (user && account) {
        try {
          // For non-credentials providers, ensure user exists in database
          if (account.provider !== "2fa" && account.provider !== "passkey") {
            const dbUser = await prisma.user.upsert({
              where: {
                email:
                  user.email ||
                  `${account.providerAccountId}@${account.provider}.local`,
              },
              update: {
                name: user.name,
                image: user.image,
              },
              create: {
                email:
                  user.email ||
                  `${account.providerAccountId}@${account.provider}.local`,
                name: user.name || `User ${account.providerAccountId}`,
                image: user.image,
                emailVerified: user.email ? new Date() : null,
              },
            });
            token.id = dbUser.id;
            // Keep token fields aligned with DB
            token.name = dbUser.name || token.name;
            token.email = dbUser.email ?? null;
            const safeImage = sanitizeUserImage(dbUser.image);
            (token as Record<string, unknown>).picture =
              safeImage ?? (token as Record<string, unknown>).picture;
            (token as Record<string, unknown>).image =
              safeImage ?? (token as Record<string, unknown>).image;
            (token as Record<string, unknown>).emailVerified =
              dbUser.emailVerified ? dbUser.emailVerified.toISOString() : null;
          } else {
            // For credentials providers (2fa, passkey), user.id is already set from authorize
            token.id = user.id;
            // Propagate initial name/image as well
            token.name = user.name || token.name;
            if (typeof user.email === "string") {
              token.email = user.email;
            } else if (user.email === null) {
              token.email = null;
            }
            const safeImage = sanitizeUserImage(
              user.image as string | null | undefined
            );
            (token as Record<string, unknown>).picture =
              safeImage ?? (token as Record<string, unknown>).picture;
            (token as Record<string, unknown>).image =
              safeImage ?? (token as Record<string, unknown>).image;
            const userEmailVerified = (user as { emailVerified?: Date | null })
              .emailVerified;
            if (userEmailVerified instanceof Date) {
              (token as Record<string, unknown>).emailVerified =
                userEmailVerified.toISOString();
            } else if (userEmailVerified === null) {
              (token as Record<string, unknown>).emailVerified = null;
            }
          }
        } catch (error) {
          console.error("Error ensuring user exists:", error);
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
        const uid = (token.id as string) || token.sub;
        if (uid) {
          (session.user as { id?: string }).id = uid;
        }
        // PERFORMANCE FIX: Use token values directly instead of DB query on every request.
        // The JWT already contains name/email/image from login or update trigger.
        // This eliminates ~500-1000ms DB latency per API call.
        const tokenName = token.name as string | undefined;
        if (tokenName) {
          (session.user as { name?: string }).name = tokenName;
        } else if (!session.user.name) {
          const inferredName =
            (session.user.email
              ? session.user.email.split("@")[0]
              : undefined) || "Player";
          (session.user as { name?: string }).name = inferredName;
        }
        const tokenImage =
          ((token as Record<string, unknown>).picture as string | undefined) ??
          ((token as Record<string, unknown>).image as string | undefined);
        if (typeof tokenImage === "string") {
          (session.user as { image?: string | null }).image =
            sanitizeUserImage(tokenImage);
        }
        const tokenEmail = token.email as string | null | undefined;
        if (typeof tokenEmail === "string") {
          (session.user as { email?: string | null }).email = tokenEmail;
        } else if (tokenEmail === null) {
          (session.user as { email?: string | null }).email = null;
        }
        const tokenEmailVerified = (token as Record<string, unknown>)
          .emailVerified;
        if (
          typeof tokenEmailVerified === "string" ||
          tokenEmailVerified === null
        ) {
          (session.user as { emailVerified?: string | null }).emailVerified =
            tokenEmailVerified ?? null;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  debug: process.env.NODE_ENV === "development",
};

// Minimal shape we rely on across API routes
export type AppSession = { user?: { id: string } } | null;

export async function getServerAuthSession(): Promise<AppSession> {
  try {
    const session = await getServerSession(authOptions);
    return session;
  } catch (error) {
    console.error("Failed to get server auth session:", error);
    return null;
  }
}
