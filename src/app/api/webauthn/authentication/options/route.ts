import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { GenerateAuthenticationOptionsOpts } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const rpID = process.env.WEB_AUTHN_RP_ID || 'localhost';
    const opts: GenerateAuthenticationOptionsOpts = {
      rpID,
      userVerification: 'preferred',
      // allowCredentials empty enables discoverable credentials (passkeys)
      allowCredentials: [],
    };
    const options = await generateAuthenticationOptions(opts);

    const res = NextResponse.json({ options });
    const secure = process.env.NODE_ENV === 'production';
    res.cookies.set('wa_chal', options.challenge, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60,
    });
    return res;
  } catch (e) {
    console.error('webauthn authentication options error', e);
    return new Response('Server error', { status: 500 });
  }
}
