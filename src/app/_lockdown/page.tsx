"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function LockdownPage() {
  const router = useRouter();
  const params = useSearchParams();
  const from = useMemo(() => (params?.get?.("from") ?? "/"), [params]);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/_lockdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass }),
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setError(j?.error || "Invalid credentials");
        setBusy(false);
        return;
      }
      // Cookie set by route; redirect to original path
      router.replace(from);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  useEffect(() => {
    // Pre-fill username from last attempt (if any)
    try {
      const u = sessionStorage.getItem("lock_user");
      if (u) setUser(u);
    } catch {}
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem("lock_user", user); } catch {}
  }, [user]);

  return (
    <main className="lock-root">
      <div className="bg">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>

      <section className="card">
        <div className="icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <circle cx="12" cy="16" r="1" />
          </svg>
        </div>
        <h1>Private Access</h1>
        <p className="sub">This preview is password protected.</p>

        <form onSubmit={unlock} className="form">
          <label className="field">
            <span>Username (optional)</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="username"
              placeholder="admin"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="pw">
              <input
                type={show ? "text" : "password"}
                inputMode="text"
                autoComplete="current-password"
                placeholder="••••••••"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button type="button" className="eye" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}>
                {show ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.6-1.39 1.5-2.73 2.57-3.89M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-3.42M3 3l18 18"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </label>

          {error ? <p className="err">{String(error)}</p> : null}

          <button type="submit" className="btn" disabled={busy || !pass}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>

        <p className="hint">Access provided to testers. Contact the team if you need an invite.</p>
      </section>

      <style jsx>{`
        .lock-root { min-height: 100svh; display: grid; place-items: center; position: relative; overflow: hidden; background: radial-gradient(ellipse 70% 40% at 50% -5%, rgba(212,169,74,0.14), transparent 60%), linear-gradient(180deg, #0c1222 0%, #070a14 100%); color: #ece7d7; font-family: var(--font-rc-sans); }
        .bg { position: absolute; inset: -20%; filter: blur(80px); opacity: 0.22; }
        .blob { position: absolute; width: 40vmax; height: 40vmax; border-radius: 50%; mix-blend-mode: screen; }
        .b1 { background: #8c6b20; top: -10%; left: -10%; animation: float1 22s ease-in-out infinite; }
        .b2 { background: #c97c3d; bottom: -15%; right: -15%; animation: float2 26s ease-in-out infinite; }
        .b3 { background: #d4a94a; top: 30%; right: 10%; width: 30vmax; height: 30vmax; animation: float3 28s ease-in-out infinite; }
        @keyframes float1 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(5%, -4%) } }
        @keyframes float2 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-6%, 3%) } }
        @keyframes float3 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(4%, -5%) } }

        .card { position: relative; z-index: 1; width: 92vw; max-width: 480px; padding: 28px; border-radius: 10px; border: 1px solid rgba(236,231,215,0.18); background: rgba(9,13,25,0.82); backdrop-filter: blur(8px); box-shadow: 0 18px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(251,246,232,0.04); }
        .icon { display: grid; place-items: center; width: 84px; height: 84px; margin: 8px auto 10px; border-radius: 50%; color: #b9b4a2; border: 1px solid rgba(236,231,215,0.18); background: linear-gradient(135deg, #1a2440, #0b1020); box-shadow: inset 0 1px 0 rgba(251,246,232,0.06); }
        h1 { margin: 8px 0 6px; font-family: var(--font-rc-display); font-size: 30px; line-height: 1.1; color: #fbf6e8; text-align: center; }
        .sub { margin: 0 0 18px; color: #b9b4a2; font-size: 14px; text-align: center; }

        .form { display: grid; gap: 14px; }
        .field { display: grid; gap: 8px; }
        .field span { font-family: var(--font-rc-mono); font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: #e3ba55; }
        .field input { width: 100%; padding: 12px 14px; border-radius: 6px; border: 1px solid rgba(236,231,215,0.22); background: rgba(0,0,0,0.45); color: #ece7d7; outline: none; font-family: var(--font-rc-mono); font-size: 13px; }
        .field input::placeholder { color: #5f5c50; }
        .field input:focus { border-color: #f3cf6a; box-shadow: 0 0 0 1px #f3cf6a; }
        .pw { position: relative; }
        .pw input { padding-right: 44px; }
        .pw .eye { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 6px; border: 1px solid rgba(236,231,215,0.22); background: rgba(0,0,0,0.35); color: #b9b4a2; display: grid; place-items: center; cursor: pointer; }
        .pw .eye:hover { border-color: #d4a94a; color: #f3cf6a; }

        .btn { margin-top: 6px; width: 100%; padding: 12px 16px; border-radius: 6px; border: 1px solid #b8913b; background: linear-gradient(180deg, #e8bf5c, #d4a94a); color: #1a1407; font-weight: 600; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.45); }
        .btn:disabled { opacity: 0.6; cursor: default; }
        .err { margin: 2px 2px 0; color: #b9543d; font-family: var(--font-rc-mono); font-size: 12px; }
        .hint { margin-top: 16px; font-family: var(--font-rc-mono); font-size: 11px; letter-spacing: 0.1em; color: #5f5c50; text-align: center; }
      `}</style>
    </main>
  );
}
