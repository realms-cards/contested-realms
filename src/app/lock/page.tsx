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
  const [ascii, setAscii] = useState<string | null>(null);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lock", {
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

  // Load ASCII background from public/skull.txt
  useEffect(() => {
    let cancelled = false;
    fetch("/skull.txt", { cache: "force-cache" })
      .then(r => r.ok ? r.text() : Promise.reject(new Error("not_ok")))
      .then(t => { if (!cancelled) setAscii(t); })
      .catch(() => { if (!cancelled) setAscii(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="lock-root">

      {ascii ? (
        <pre className="ascii" aria-hidden>
{ascii}
        </pre>
      ) : null}

      <section className="card">
        <form onSubmit={unlock} className="form">
          <label className="field">
            <input
              type="text"
              inputMode="text"
              autoComplete="username"
              placeholder="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </label>

          <label className="field">
            <input
              type="password"
              inputMode="text"
              autoComplete="current-password"
              placeholder="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>

          {error ? <p className="err">{String(error)}</p> : null}

          <button type="submit" className="btn" disabled={busy || !pass}>
            Enter
          </button>
        </form>
      </section>

      <style jsx>{`
        .lock-root { min-height: 100svh; display: grid; place-items: center; position: relative; overflow: hidden; background: radial-gradient(ellipse 70% 40% at 50% -5%, rgba(212,169,74,0.14), transparent 60%), linear-gradient(180deg, #0c1222 0%, #070a14 100%); color: #ece7d7; font-family: var(--font-rc-mono); }
        .ascii { color: #5f5c50; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 95vw; max-height: 95vh; overflow: hidden; z-index: 0; opacity: 0.08; pointer-events: none; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; white-space: pre; line-height: 0.9; }
        .card { position: relative; z-index: 1; width: 92vw; max-width: 420px; padding: 20px; border-radius: 10px; border: 1px solid rgba(236,231,215,0.18); background: rgba(9,13,25,0.82); backdrop-filter: blur(6px); box-shadow: 0 6px 14px rgba(0,0,0,0.40), inset 0 1px 0 rgba(251,246,232,0.04), inset 0 -1px 0 rgba(0,0,0,0.35); }

        .form { display: grid; gap: 10px; }
        .field { display: grid; }
        .field input { width: 100%; padding: 12px 14px; border-radius: 6px; border: 1px solid rgba(236,231,215,0.22); background: rgba(0,0,0,0.45); color: #ece7d7; outline: none; font-family: inherit; font-size: 13px; }
        .field input::placeholder { color: #5f5c50; }
        .field input:focus { border-color: #f3cf6a; box-shadow: 0 0 0 1px #f3cf6a; }

        .btn { margin-top: 6px; width: 100%; padding: 12px 16px; border-radius: 6px; border: 1px solid #b8913b; background: linear-gradient(180deg, #e8bf5c, #d4a94a); color: #1a1407; font-weight: 600; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.45); font-family: var(--font-rc-sans); }
        .btn:disabled { opacity: 0.6; cursor: default; }
        .err { margin: 4px 2px 0; color: #b9543d; font-size: 12px; }
      `}</style>
    </main>
  );
}
