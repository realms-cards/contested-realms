import { NextRequest, NextResponse } from 'next/server'

// Enable with BASIC_AUTH_ENABLED=true and set BASIC_AUTH_PASSWORD (and optionally BASIC_AUTH_USER)
// This middleware runs on Vercel Edge and protects the entire site behind HTTP Basic Auth.

function isEnabled() {
  const v = (process.env.BASIC_AUTH_ENABLED || process.env.LOCKDOWN_ENABLED || '').toLowerCase();
  const explicit = v === '1' || v === 'true' || v === 'yes' || v === 'on';
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  const preview = vercelEnv === 'preview';
  return explicit || preview;
}

function setLockdown(res: NextResponse, state: string) {
  try { res.headers.set('x-lockdown', state); } catch {}
  return res;
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

  // Allow the custom lockdown page(s), API, and diagnostics without auth to avoid loops
  if (
    pathname.startsWith('/lock') ||
    pathname.startsWith('/_lockdown') ||
    pathname.startsWith('/api/lock') ||
    pathname.startsWith('/_diag')
  ) {
    return setLockdown(NextResponse.next(), 'lockpage');
  }

  // If enabled but password not configured, redirect to lock page with error
  if (!expectedPass) {
    const url = new URL('/lock', req.url);
    try { url.searchParams.set('from', req.nextUrl.pathname + req.nextUrl.search); } catch {}
    try { url.searchParams.set('error', 'server'); } catch {}
    return setLockdown(NextResponse.redirect(url), 'redirect');
  }

  // If a previous successful auth set a cookie, allow
  const cookieOk = req.cookies.get('basic_auth')?.value === 'ok';
  if (cookieOk) return setLockdown(NextResponse.next(), 'enabled-cookie');

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Basic ')) {
    const url = new URL('/lock', req.url);
    try { url.searchParams.set('from', req.nextUrl.pathname + req.nextUrl.search); } catch {}
    return setLockdown(NextResponse.redirect(url), 'redirect');
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

  // On failure, redirect back to lock screen with error
  const url = new URL('/lock', req.url);
  try { url.searchParams.set('from', req.nextUrl.pathname + req.nextUrl.search); } catch {}
  try { url.searchParams.set('error', '1'); } catch {}
  return setLockdown(NextResponse.redirect(url), 'redirect');
}

// Apply to all routes except static/image optimizer/favicon/robots/sitemap
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
