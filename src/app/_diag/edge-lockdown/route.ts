export async function GET() {
  const enabledRaw = (process.env.BASIC_AUTH_ENABLED || process.env.LOCKDOWN_ENABLED || '').toString();
  const enabled = ['1', 'true', 'yes', 'on'].includes(enabledRaw.toLowerCase());
  const havePass = !!(process.env.BASIC_AUTH_PASSWORD || process.env.BASIC_AUTH_PASS);
  const haveUser = !!process.env.BASIC_AUTH_USER;

  return new Response(
    JSON.stringify({
      runtime: 'nodejs',
      enabledRaw,
      enabled,
      haveUser,
      havePass,
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    }
  );
}
