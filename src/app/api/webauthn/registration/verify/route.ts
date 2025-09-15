import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { attestation: RegistrationResponseJSON } | null;
    if (!body?.attestation) return new Response('Bad request', { status: 400 });
    const attestation = body.attestation;

    // Expected
    const rpID = process.env.WEB_AUTHN_RP_ID || 'localhost';
    const expectedOrigin = process.env.WEB_AUTHN_ORIGIN || process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // Retrieve cookies set during /registration/options
    const chal = req.cookies.get('wa_chal')?.value;
    const uid = req.cookies.get('wa_uid')?.value;
    if (!chal || !uid) return new Response('Missing challenge', { status: 400 });

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: chal,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return new Response('Verification failed', { status: 400 });
    }

    const info = verification.registrationInfo;

    // Persist credential (ignore duplicates via credentialId unique)
    const resp = attestation.response as unknown as { transports?: string[] };
    const transports = Array.isArray(resp?.transports) ? resp.transports : undefined;
    await prisma.passkeyCredential.create({
      data: {
        userId: uid,
        credentialId: Buffer.from(info.credentialID),
        publicKey: Buffer.from(info.credentialPublicKey),
        counter: info.counter || 0,
        transports: transports && transports.length ? transports.join(',') : null,
        aaguid: info.aaguid || null,
        attestationType: null, // Not available in v9.x
        deviceType: info.credentialDeviceType || null,
        backedUp: info.credentialBackedUp ?? null,
      },
    });

    const res = NextResponse.json({ ok: true });
    // Clear challenge cookies
    const secure = process.env.NODE_ENV === 'production';
    res.cookies.set('wa_chal', '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
    res.cookies.set('wa_uid', '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
    return res;
  } catch (e) {
    console.error('webauthn registration verify error', e);
    return new Response('Server error', { status: 500 });
  }
}
