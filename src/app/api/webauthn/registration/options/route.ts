import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { GenerateRegistrationOptionsOpts } from '@simplewebauthn/server';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const displayNameReq: string | undefined = typeof body?.displayName === 'string' ? body.displayName : undefined;

    // Resolve user: if session exists, use it; otherwise create a new minimal user
    const session = await getServerSession(authOptions);
    let userId: string | null = session?.user?.id || null;
    let userName: string | null = session?.user?.name || null;

    if (!userId) {
      const baseName = (displayNameReq || 'Player').trim().slice(0, 40);
      const user = await prisma.user.create({
        data: {
          name: baseName,
        },
      });
      userId = user.id;
      userName = user.name;
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
