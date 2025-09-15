"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function LockPage() {
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
      const res = await fetch("/lock", {
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
      router.replace(from);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  useEffect(() => {
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
        .lock-root { min-height: 100svh; display: grid; place-items: center; position: relative; overflow: hidden; background: radial-gradient(1200px 600px at 0% 0%, #1d2340 0%, #0b0f1d 60%, #070a13 100%); color: #e9ecf1; }
        .bg { position: absolute; inset: -20%; filter: blur(60px); opacity: 0.6; }
        .blob { position: absolute; width: 40vmax; height: 40vmax; border-radius: 50%; mix-blend-mode: screen; }
        .b1 { background: #6a5acd; top: -10%; left: -10%; animation: float1 22s ease-in-out infinite; }
        .b2 { background: #00c2ff; bottom: -15%; right: -15%; animation: float2 26s ease-in-out infinite; }
        .b3 { background: #ff5ea0; top: 30%; right: 10%; width: 30vmax; height: 30vmax; animation: float3 28s ease-in-out infinite; }
        @keyframes float1 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(5%, -4%) } }
        @keyframes float2 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-6%, 3%) } }
        @keyframes float3 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(4%, -5%) } }

        .card { position: relative; z-index: 1; width: 92vw; max-width: 480px; padding: 28px; border-radius: 18px; background: rgba(255,255,255,0.06); backdrop-filter: blur(14px) saturate(120%); box-shadow: 0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12); }
        .icon { display: grid; place-items: center; width: 84px; height: 84px; margin: 8px auto 10px; border-radius: 50%; color: #e9ecf1; background: linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 30px rgba(0,0,0,0.25); }
        h1 { margin: 8px 0 6px; font-size: 22px; letter-spacing: 0.2px; text-align: center; }
        .sub { margin: 0 0 18px; opacity: 0.8; font-size: 14px; text-align: center; }

        .form { display: grid; gap: 14px; }
        .field { display: grid; gap: 8px; }
        .field span { font-size: 12px; opacity: 0.8; }
        .field input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); background: rgba(12,18,30,0.5); color: #e9ecf1; outline: none; }
        .field input::placeholder { color: rgba(233,236,241,0.5); }
        .field input:focus { border-color: rgba(0,194,255,0.6); box-shadow: 0 0 0 3px rgba(0,194,255,0.2); }
        .pw { position: relative; }
        .pw input { padding-right: 44px; }
        .pw .eye { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e9ecf1; display: grid; place-items: center; cursor: pointer; }
        .pw .eye:hover { background: rgba(255,255,255,0.1); }

        .btn { margin-top: 6px; width: 100%; padding: 12px 16px; border-radius: 12px; border: 0; background: linear-gradient(135deg, #00c2ff, #6a5acd); color: #0b0f1d; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
        .btn:disabled { opacity: 0.6; cursor: default; }
        .err { margin: 2px 2px 0; color: #ff7b7b; font-size: 12px; }
        .hint { margin-top: 16px; font-size: 12px; opacity: 0.7; text-align: center; }
      `}</style>
    </main>
  );
}
