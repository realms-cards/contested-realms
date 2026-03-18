"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function decodeBase64Url(encoded: string): string | null {
  try {
    // base64url → base64: replace URL-safe chars, restore padding
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    return atob(b64);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inner component (needs Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

function ExternalImportInner() {
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const listParam = searchParams?.get("list") ?? "";
  const nameParam = searchParams?.get("name") ?? "";
  const sourceParam = searchParams?.get("source") ?? "";

  // Decode the card list from the URL
  const decodedText = useMemo(() => {
    if (!listParam) return null;
    return decodeBase64Url(listParam);
  }, [listParam]);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<
    { name: string; count: number }[] | null
  >(null);
  const [warnings, setWarnings] = useState<{
    fuzzyMatches?: { original: string; matched: string; count: number }[];
    unresolved?: { name: string; count: number }[];
  } | null>(null);
  const [success, setSuccess] = useState(false);
  const [importedOnce, setImportedOnce] = useState(false);

  const doImport = useCallback(async () => {
    if (!decodedText || importing || success) return;
    setImporting(true);
    setError(null);
    setUnresolved(null);
    setWarnings(null);

    try {
      const res = await fetch("/api/decks/import/external", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: decodedText,
          name: nameParam || undefined,
          source: sourceParam || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data?.error === "string" ? data.error : "Import failed"
        );
        if (Array.isArray(data?.unresolved)) {
          setUnresolved(
            (data.unresolved as unknown[])
              .map((u: unknown) => {
                const o =
                  u && typeof u === "object"
                    ? (u as Record<string, unknown>)
                    : {};
                return {
                  name: String(o.name ?? ""),
                  count: Number(o.count ?? 0),
                };
              })
              .filter((u) => u.name)
          );
        }
        return;
      }

      // Success
      if (data.warnings) {
        setWarnings(data.warnings as typeof warnings);
      }

      setSuccess(true);

      // Notify deck list listeners
      try {
        window.dispatchEvent(
          new CustomEvent("decks:refresh", {
            detail: {
              deck: {
                id: data.id as string,
                name: data.name as string,
                format: (data.format as string) || "Constructed",
              },
            },
          })
        );
      } catch {
        // ignore
      }

      // Redirect to deck editor after short delay so user sees the success message
      const deckId = data.id as string;
      setTimeout(() => {
        router.push(`/decks/editor-3d?id=${encodeURIComponent(deckId)}`);
      }, 1500);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Network error during import"
      );
    } finally {
      setImporting(false);
    }
  }, [decodedText, nameParam, sourceParam, importing, success, router]);

  // Auto-import once when authenticated and text is decoded
  useEffect(() => {
    if (
      authStatus === "authenticated" &&
      decodedText &&
      !importedOnce &&
      !importing &&
      !success &&
      !error
    ) {
      setImportedOnce(true);
      doImport();
    }
  }, [authStatus, decodedText, importedOnce, importing, success, error, doImport]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const sourceLabel = sourceParam
    ? sourceParam.charAt(0).toUpperCase() + sourceParam.slice(1)
    : "External";

  // No list parameter
  if (!listParam) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-amber-400">
          No card list provided. The URL must include a <code>list</code>{" "}
          parameter with a base64url-encoded card list.
        </p>
      </Panel>
    );
  }

  // Decode failure
  if (decodedText === null) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-amber-400">
          Failed to decode the card list. The <code>list</code> parameter
          contains invalid base64url data.
        </p>
      </Panel>
    );
  }

  // Size limit
  if (decodedText.length > 10_000) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-amber-400">
          Card list is too large (max 10 KB).
        </p>
      </Panel>
    );
  }

  // Not authenticated
  if (authStatus === "loading") {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-slate-400">Checking authentication...</p>
        <CardListPreview text={decodedText} />
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-slate-200">
          Sign in to import this deck{nameParam ? ` ("${nameParam}")` : ""}.
        </p>
        <div className="flex justify-center pt-2">
          <AuthButton />
        </div>
        <CardListPreview text={decodedText} />
      </Panel>
    );
  }

  // Importing
  if (importing) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          Importing deck...
        </div>
        <CardListPreview text={decodedText} />
      </Panel>
    );
  }

  // Error
  if (error) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-red-400">{error}</p>
        {unresolved && unresolved.length > 0 && (
          <div className="mt-2 text-sm text-slate-400">
            <p className="font-medium text-slate-300">Unresolved cards:</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {unresolved.map((u) => (
                <li key={u.name}>
                  {u.count}x {u.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={() => {
            setError(null);
            setUnresolved(null);
            setImportedOnce(false);
          }}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          Retry
        </button>
        <CardListPreview text={decodedText} />
      </Panel>
    );
  }

  // Success
  if (success) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="text-emerald-400 font-medium">
          Deck imported successfully! Redirecting to editor...
        </p>
        {warnings?.fuzzyMatches && warnings.fuzzyMatches.length > 0 && (
          <div className="mt-2 text-sm text-amber-400/80">
            <p className="font-medium">Some cards were fuzzy-matched:</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {warnings.fuzzyMatches.map((w) => (
                <li key={w.original}>
                  &ldquo;{w.original}&rdquo; matched as &ldquo;{w.matched}
                  &rdquo;
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings?.unresolved &&
          (warnings.unresolved as { name: string; count: number }[]).length >
            0 && (
            <div className="mt-2 text-sm text-amber-400/80">
              <p className="font-medium">
                Some cards could not be resolved and were skipped:
              </p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {(
                  warnings.unresolved as { name: string; count: number }[]
                ).map((u) => (
                  <li key={u.name}>
                    {u.count}x {u.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </Panel>
    );
  }

  // Fallback (should not normally reach here)
  return (
    <Panel title={`${sourceLabel} Import`}>
      <CardListPreview text={decodedText} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-2">
      <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 space-y-4">
        <h1 className="text-xl font-semibold font-fantaisie text-slate-50">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

function CardListPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const displayLines = lines.slice(0, 30);
  const remaining = lines.length - displayLines.length;

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-slate-400 mb-1">
        Card list preview ({lines.length} lines):
      </p>
      <pre className="max-h-60 overflow-auto rounded-md bg-slate-950/50 p-3 text-xs text-slate-300 font-mono leading-relaxed">
        {displayLines.join("\n")}
        {remaining > 0 && `\n... and ${remaining} more`}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

export default function ExternalImportPage() {
  return (
    <OnlinePageShell>
      <Suspense
        fallback={
          <div className="pt-2">
            <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6">
              <p className="text-slate-400">Loading...</p>
            </div>
          </div>
        }
      >
        <ExternalImportInner />
      </Suspense>
    </OnlinePageShell>
  );
}
