function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    status: init?.status || 200,
  });
}

export async function POST(req: Request) {
  try {
    const { user, pass } = await req.json().catch(() => ({ user: '', pass: '' }));
    const expectedPass = process.env.BASIC_AUTH_PASSWORD || process.env.BASIC_AUTH_PASS || '';
    const expectedUser = process.env.BASIC_AUTH_USER || '';

    if (!expectedPass) {
      return json({ ok: false, error: 'server_misconfigured' }, { status: 500 });
    }

    const userOk = expectedUser ? user === expectedUser : true;
    const passOk = pass === expectedPass;

    if (!userOk || !passOk) {
      return json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
    }

    const res = json({ ok: true }, { status: 200 });
    // 12h httpOnly auth cookie mirrors middleware logic
    res.headers.append(
      'set-cookie',
      'basic_auth=ok; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax'
    );
    return res;
  } catch {
    return json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
}
