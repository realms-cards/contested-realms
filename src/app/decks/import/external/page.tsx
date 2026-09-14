"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

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
        <div className="rc-alert" data-tone="warning">
          No card list provided. The URL must include a <code>list</code>{" "}
          parameter with a base64url-encoded card list.
        </div>
      </Panel>
    );
  }

  // Decode failure
  if (decodedText === null) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <div className="rc-alert" data-tone="warning">
          Failed to decode the card list. The <code>list</code> parameter
          contains invalid base64url data.
        </div>
      </Panel>
    );
  }

  // Size limit
  if (decodedText.length > 10_000) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <div className="rc-alert" data-tone="warning">
          Card list is too large (max 10 KB).
        </div>
      </Panel>
    );
  }

  // Not authenticated
  if (authStatus === "loading") {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="rc-hint">Checking authentication...</p>
        <CardListPreview text={decodedText} />
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <p className="font-rc-sans text-sm text-rc-fg">
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
        <div className="flex items-center gap-2 font-rc-sans text-sm text-rc-fg">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-rc-accent border-t-transparent" />
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
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
        {unresolved && unresolved.length > 0 && (
          <div className="rc-alert mt-2" data-tone="warning">
            <p className="mb-1">Unresolved cards:</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {unresolved.map((u) => (
                <li key={u.name}>
                  {u.count}x {u.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        <RcButton
          variant="outline"
          className="mt-3"
          onClick={() => {
            setError(null);
            setUnresolved(null);
            setImportedOnce(false);
          }}
        >
          Retry
        </RcButton>
        <CardListPreview text={decodedText} />
      </Panel>
    );
  }

  // Success
  if (success) {
    return (
      <Panel title={`${sourceLabel} Import`}>
        <div className="rc-alert" data-tone="success">
          Deck imported successfully! Redirecting to editor...
        </div>
        {warnings?.fuzzyMatches && warnings.fuzzyMatches.length > 0 && (
          <div className="rc-alert mt-2" data-tone="warning">
            <p className="mb-1">Some cards were fuzzy-matched:</p>
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
            <div className="rc-alert mt-2" data-tone="warning">
              <p className="mb-1">
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
    <>
      <PageHeader eyebrow="deck import" title={title} size="md" />
      <section className="rc-panel space-y-4 p-6">{children}</section>
    </>
  );
}

function CardListPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const displayLines = lines.slice(0, 30);
  const remaining = lines.length - displayLines.length;

  return (
    <div className="mt-4">
      <p className="rc-hint mb-1">
        Card list preview ({lines.length} lines):
      </p>
      <pre className="max-h-60 overflow-auto rounded-rc-md border border-rc-line/12 bg-black/45 p-3 font-rc-mono text-xs leading-relaxed text-rc-fg">
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
        fallback={<div className="rc-hint py-6 text-center">loading…</div>}
      >
        <ExternalImportInner />
      </Suspense>
    </OnlinePageShell>
  );
}
