import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { GenerateRegistrationOptionsOpts } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawDisplayName: string | undefined = typeof body?.displayName === 'string' ? body.displayName : undefined;
    const displayNameReq = rawDisplayName?.trim().slice(0, 40);
    const rawEmail: string | undefined = typeof body?.email === 'string' ? body.email : undefined;
    const normalizedEmail = rawEmail ? normalizeEmail(rawEmail) : undefined;

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: 'Email address is not valid.' }, { status: 400 });
    }

    // Resolve user: if session exists, use it; otherwise create a new minimal user
    const session = await getServerSession(authOptions);
    let userId: string | null = session?.user?.id || null;
    let userName: string | null = session?.user?.name || displayNameReq || null;

    let emailOwner: { id: string } | null = null;
    if (normalizedEmail) {
      emailOwner = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (emailOwner && emailOwner.id !== userId) {
        return NextResponse.json({
          error: 'That email address is already linked to another account. Sign in first to add a passkey.',
        }, { status: 409 });
      }
    }

    if (!userId) {
      const user = await prisma.user.create({
        data: {
          name: displayNameReq || 'Player',
          email: normalizedEmail,
          emailVerified: normalizedEmail ? null : undefined,
        },
        select: { id: true, name: true },
      });
      userId = user.id;
      userName = user.name;
    } else if (normalizedEmail && (!emailOwner || emailOwner.id === userId)) {
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!existingUser) {
        return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
      }
      if (existingUser.email !== normalizedEmail) {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: {
            email: normalizedEmail,
            emailVerified: null,
          },
          select: { name: true },
        });
        userName = updated.name ?? userName;
      } else if (!userName && existingUser.name) {
        userName = existingUser.name;
      }
    }

    // Exclude existing credentials for this user
    const existing = await prisma.passkeyCredential.findMany({ where: { userId } });

    const rpID = process.env.WEB_AUTHN_RP_ID || 'localhost';
    const rpName = process.env.WEB_AUTHN_RP_NAME || 'Realms Cards';

    const opts: GenerateRegistrationOptionsOpts = {
      rpID,
      rpName,
      userID: userId,
      userName: userName || displayNameReq || 'Player',
      userDisplayName: userName || displayNameReq || 'Player',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: existing.map((c) => ({
        id: Buffer.from(c.credentialId),
        type: 'public-key' as const,
      })),
      supportedAlgorithmIDs: [-7, -257],
    };

    const options = await generateRegistrationOptions(opts);

    // Set challenge & uid cookies for verification step
    const res = NextResponse.json({ options, userId });
    const secure = process.env.NODE_ENV === 'production';
    res.cookies.set('wa_chal', options.challenge, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 5 * 60 });
    res.cookies.set('wa_uid', userId, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 5 * 60 });
    return res;
  } catch (e) {
    console.error('webauthn registration options error', e);
    return new Response('Server error', { status: 500 });
  }
}
