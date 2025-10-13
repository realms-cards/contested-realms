import { NextRequest, NextResponse } from 'next/server'

// Enable with BASIC_AUTH_ENABLED=true and set BASIC_AUTH_PASSWORD (and optionally BASIC_AUTH_USER)
// This middleware runs on Vercel Edge and protects the entire site behind HTTP Basic Auth.

const ADMIN_PATHS = [/^\/admin(?:$|\/)/, /^\/api\/admin(?:$|\/)/];

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

function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toIpv4Int(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return null;
    }
    result = (result << 8) + value;
  }
  return result >>> 0;
}

function matchesCidr(ip: string, cidr: string): boolean {
  const [base, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (!base || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const ipInt = toIpv4Int(ip);
  const baseInt = toIpv4Int(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    const trimmed = ip.slice(7);
    return trimmed || null;
  }
  return ip;
}

function ipAllowed(ip: string | null, allowlist: string[]): boolean {
  if (!ip) return false;
  for (const entry of allowlist) {
    if (entry.includes('/')) {
      if (matchesCidr(ip, entry)) return true;
      continue;
    }
    if (entry === ip) return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const adminPathsEnabled = ADMIN_PATHS.some((re) => re.test(pathname));
  if (adminPathsEnabled) {
    const allowlist = parseAllowlist(process.env.ADMIN_IP_ACCESSLIST);
    if (allowlist.length > 0) {
      const clientIpHeader = req.headers.get('x-forwarded-for') || '';
      const clientIpList = clientIpHeader
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const headerIp = normalizeIp(clientIpList[0]);
      const realIp = normalizeIp(req.headers.get('x-real-ip'));
      const fallbackIp =
        headerIp || realIp || (process.env.NODE_ENV !== 'production' ? '127.0.0.1' : null);
      const allowed = fallbackIp ? ipAllowed(fallbackIp, allowlist) : allowlist.length === 0;
      if (!allowed) {
        return new NextResponse('forbidden', { status: 403 });
      }
    }
  }

  if (!isEnabled()) return setLockdown(NextResponse.next(), 'disabled');

  const expectedPass = process.env.BASIC_AUTH_PASSWORD || process.env.BASIC_AUTH_PASS || '';
  const expectedUser = process.env.BASIC_AUTH_USER || '';

  // Internal API bypass: allow trusted server-to-server calls to API routes
  // Requires headers:
  //  - x-internal-call: true
  //  - x-internal-key: matches process.env.INTERNAL_API_KEY
  if (pathname.startsWith('/api')) {
    const flag = (req.headers.get('x-internal-call') || '').toLowerCase();
    const key = req.headers.get('x-internal-key') || '';
    const expectedKeys = [
      process.env.INTERNAL_API_KEY || '',
      process.env.NEXTAUTH_SECRET || '',
    ].filter(Boolean);
    const isOn = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
    const allowed = isOn && (
      // Allow without key in non-production for local/dev
      process.env.NODE_ENV !== 'production' ||
      (expectedKeys.length > 0 && expectedKeys.includes(key))
    );
    if (allowed) {
      return setLockdown(NextResponse.next(), 'internal');
    }
  }

  // Allow Next static assets and image optimizer without auth challenge for better DX
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    pathname === '/skull.txt' ||
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
    pathname.startsWith('/api/assets') ||
    pathname.startsWith('/api/images') ||
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
