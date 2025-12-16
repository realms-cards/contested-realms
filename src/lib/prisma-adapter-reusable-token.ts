/**
 * Custom Prisma Adapter that allows verification tokens to be reused
 *
 * Problem: Email security scanners (Barracuda, Microsoft ATP, Proofpoint, etc.)
 * prefetch magic links before they reach the user's inbox, consuming the one-time token.
 *
 * Solution: Instead of deleting the token on first use, we just return it.
 * The token still expires naturally based on its `expires` field.
 *
 * @see https://github.com/nextauthjs/next-auth/discussions/4585
 */

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { Adapter } from "next-auth/adapters";

export function ReusableTokenPrismaAdapter(prisma: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(prisma);

  return {
    ...baseAdapter,
    // Override useVerificationToken to NOT delete the token
    // This allows the token to be used multiple times until it expires
    async useVerificationToken({ identifier, token }) {
      try {
        console.log("[ReusableTokenAdapter] Looking up token:", {
          identifier,
          tokenPrefix: token.substring(0, 10) + "...",
        });

        // Find the token without deleting it
        const verificationToken = await prisma.verificationToken.findUnique({
          where: {
            identifier_token: {
              identifier,
              token,
            },
          },
        });

        console.log(
          "[ReusableTokenAdapter] Token found:",
          verificationToken ? "yes" : "no"
        );

        if (!verificationToken) {
          // Debug: list all tokens for this identifier
          const allTokens = await prisma.verificationToken.findMany({
            where: { identifier },
            select: { token: true, expires: true },
          });
          console.log(
            "[ReusableTokenAdapter] All tokens for identifier:",
            allTokens.map((t) => ({
              tokenPrefix: t.token.substring(0, 10),
              expires: t.expires,
            }))
          );
          return null;
        }

        // Check if token has expired
        if (verificationToken.expires < new Date()) {
          // Token expired - delete it and return null
          await prisma.verificationToken
            .delete({
              where: {
                identifier_token: {
                  identifier,
                  token,
                },
              },
            })
            .catch(() => {
              // Ignore if already deleted
            });
          return null;
        }

        // Return the token without deleting it
        // This allows reuse until expiry
        return verificationToken;
      } catch {
        // If token doesn't exist, return null
        return null;
      }
    },
  };
}
