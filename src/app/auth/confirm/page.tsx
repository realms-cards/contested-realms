"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ConfirmState = {
  nextUrl: string | null;
  error: string | null;
};

function resolveNextUrl(raw: string, origin: string): ConfirmState {
  if (!raw) {
    return { nextUrl: null, error: "Missing sign-in link." };
  }
  try {
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin) {
      return { nextUrl: null, error: "Invalid sign-in link." };
    }
    if (!parsed.pathname.startsWith("/api/auth/callback/")) {
      return { nextUrl: null, error: "Invalid sign-in link." };
    }
    return { nextUrl: parsed.toString(), error: null };
  } catch {
    return { nextUrl: null, error: "Invalid sign-in link." };
  }
}

export default function ConfirmSignInPage() {
  const searchParams = useSearchParams();
  const nextParam = searchParams?.get("next") || "";
  const emailParam = searchParams?.get("email");
  const [state, setState] = useState<ConfirmState>({
    nextUrl: null,
    error: null,
  });

  useEffect(() => {
    const origin = window.location.origin;
    setState(resolveNextUrl(nextParam, origin));
  }, [nextParam]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
            Realms.cards
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-100">
            Confirm sign-in
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            To protect against email scanners, please confirm before we finish
            signing you in.
          </p>
        </div>

        {emailParam ? (
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
            Signing in as <span className="font-semibold">{emailParam}</span>
          </div>
        ) : null}

        {state.error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {state.error} Please request a new magic link.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            onClick={() => {
              if (state.nextUrl) {
                window.location.assign(state.nextUrl);
              }
            }}
            disabled={!state.nextUrl}
          >
            Continue to sign in
          </button>
          <a
            href="/auth/signin"
            className="text-center text-sm text-slate-300 hover:text-slate-100"
          >
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
