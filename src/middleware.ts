import { NextRequest, NextResponse } from 'next/server'

// Enable with BASIC_AUTH_ENABLED=true and set BASIC_AUTH_PASSWORD (and optionally BASIC_AUTH_USER)
// This middleware runs on Vercel Edge and protects the entire site behind HTTP Basic Auth.

function isEnabled() {
  const v = (process.env.BASIC_AUTH_ENABLED || process.env.LOCKDOWN_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function setLockdown(res: NextResponse, state: string) {
  try { res.headers.set('x-lockdown', state); } catch {}
  return res;
}

function unauthorized() {
  const res = new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Realms", charset="UTF-8"' },
  });
  return setLockdown(res, 'unauthorized');
}

function decodeBase64(b64: string): string {
  try {
    return atob(b64);
  } catch {
    return '';
  }
}

export async function middleware(req: NextRequest) {
  if (!isEnabled()) return setLockdown(NextResponse.next(), 'disabled');

  const expectedPass = process.env.BASIC_AUTH_PASSWORD || process.env.BASIC_AUTH_PASS || '';
  const expectedUser = process.env.BASIC_AUTH_USER || '';
  // If enabled but password not configured, fail closed to avoid accidental exposure
  if (!expectedPass) return unauthorized();

  const { pathname } = req.nextUrl;

  // Allow Next static assets and image optimizer without auth challenge for better DX
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return setLockdown(NextResponse.next(), 'enabled-static');
  }

  // If a previous successful auth set a cookie, allow
  const cookieOk = req.cookies.get('basic_auth')?.value === 'ok';
  if (cookieOk) return setLockdown(NextResponse.next(), 'enabled-cookie');

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Basic ')) {
    return unauthorized();
  }

  try {
    const base64 = auth.slice(6).trim();
    const decoded = decodeBase64(base64);
    const [user, pass] = decoded.split(':');
    const userOk = expectedUser ? user === expectedUser : true;
    const passOk = pass === expectedPass;

    if (userOk && passOk) {
      const res = setLockdown(NextResponse.next(), 'ok');
      // Cache auth with a short-lived, httpOnly cookie to reduce repeated prompts across navigations
      res.cookies.set('basic_auth', 'ok', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 12, // 12 hours
        path: '/',
      });
      return res;
    }
  } catch {}

  return unauthorized();
}

// Apply to all routes except static/image optimizer/favicon/robots/sitemap
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
