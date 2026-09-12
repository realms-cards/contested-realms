"use client";

import { useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { generateTournamentName } from "@/lib/random-name-generator";

interface Props {
  onCreated: (tournamentId: string) => void;
}

/** Mono spaced-caps label above a form control. */
const FIELD_LABEL =
  "mb-1.5 block font-rc-mono text-[11px] uppercase tracking-[0.18em] text-rc-fg-subtle";

export function OpenTournamentCreateForm({ onCreated }: Props) {
  const [name, setName] = useState(() => generateTournamentName());
  const [gameFormat, setGameFormat] = useState<
    "constructed" | "sealed" | "draft"
  >("constructed");
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [isPrivate, setIsPrivate] = useState(false);
  const [playNetworkUrl, setPlayNetworkUrl] = useState("");
  const [pairingSource, setPairingSource] = useState<"swiss" | "manual">(
    "swiss",
  );
  const [allowRealms, setAllowRealms] = useState(true);
  const [allowManualReport, setAllowManualReport] = useState(true);
  const [requireHostApproval, setRequireHostApproval] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        name: name.trim(),
        gameFormat,
        maxPlayers,
        isPrivate,
        ...(playNetworkUrl.trim()
          ? { playNetworkUrl: playNetworkUrl.trim() }
          : {}),
        pairing: { source: pairingSource },
        matchResolution: {
          allowRealms,
          allowManualReport,
          requireHostApproval,
        },
      };

      const res = await fetch("/api/open-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tournament");

      onCreated(data.tournament.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className={FIELD_LABEL}>Event Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rc-input h-10 w-full"
          required
          minLength={3}
          maxLength={100}
        />
      </div>

      {/* Game Format */}
      <div>
        <label className={FIELD_LABEL}>Game Format</label>
        <div className="rc-segment">
          {(["constructed", "sealed", "draft"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={gameFormat === f}
              onClick={() => setGameFormat(f)}
            >
              {f === "constructed"
                ? "Constructed"
                : f === "sealed"
                  ? "Sealed"
                  : "Draft"}
            </button>
          ))}
        </div>
        <p className="rc-hint mt-1.5 leading-relaxed">
          Players are expected to use this format — deck prep is handled
          externally
        </p>
      </div>

      {/* Max Players */}
      <div>
        <label className={FIELD_LABEL}>Max Players</label>
        <input
          type="number"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          min={2}
          max={128}
          className="rc-input h-10 w-full"
        />
        <p className="rc-hint mt-1.5">Soft limit — host can add more players</p>
      </div>

      {/* Play Network URL */}
      <div>
        <label className={FIELD_LABEL}>
          Play Network Event URL
          <span className="ml-1 normal-case tracking-[0.1em] text-rc-fg-dim">
            (optional)
          </span>
        </label>
        <input
          type="url"
          value={playNetworkUrl}
          onChange={(e) => setPlayNetworkUrl(e.target.value)}
          placeholder="https://playnetwork.gg/event/..."
          className="rc-input h-10 w-full"
        />
        <p className="rc-hint mt-1.5">
          Players can click this link to register on Play Network
        </p>
      </div>

      {/* Pairing Mode */}
      <div>
        <label className={FIELD_LABEL}>Default Pairing Mode</label>
        <div className="flex flex-wrap gap-4">
          <label className="rc-check">
            <input
              type="radio"
              name="pairingSource"
              value="swiss"
              checked={pairingSource === "swiss"}
              onChange={() => setPairingSource("swiss")}
            />
            Swiss (auto)
          </label>
          <label className="rc-check">
            <input
              type="radio"
              name="pairingSource"
              value="manual"
              checked={pairingSource === "manual"}
              onChange={() => setPairingSource("manual")}
            />
            Manual
          </label>
        </div>
        <p className="rc-hint mt-1.5">You can always override per round</p>
      </div>

      {/* Match Resolution */}
      <div>
        <label className={FIELD_LABEL}>Match Resolution</label>
        <div className="flex flex-col gap-2">
          <label className="rc-check">
            <input
              type="checkbox"
              checked={allowRealms}
              onChange={(e) => setAllowRealms(e.target.checked)}
            />
            Allow playing on Realms
          </label>
          <label className="rc-check">
            <input
              type="checkbox"
              checked={allowManualReport}
              onChange={(e) => setAllowManualReport(e.target.checked)}
            />
            Allow manual result reporting (TTS, paper)
          </label>
          <label className="rc-check">
            <input
              type="checkbox"
              checked={requireHostApproval}
              onChange={(e) => setRequireHostApproval(e.target.checked)}
            />
            Require host approval for manual results
          </label>
        </div>
      </div>

      {/* Private */}
      <label className="rc-check">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        Private event (only visible to invited players)
      </label>

      {/* Submit */}
      <RcButton
        type="submit"
        disabled={submitting || !name.trim()}
        className="w-full"
      >
        {submitting ? "Creating..." : "Create Event"}
      </RcButton>
    </form>
  );
}
