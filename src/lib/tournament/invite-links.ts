/**
 * Tournament invite links. The token lives on `Tournament.inviteToken`;
 * possession lets anyone - account or guest - view and join the tournament,
 * private or not. Same query param as lobby invites so the guest gate can
 * treat every invite the same way.
 */

export const TOURNAMENT_INVITE_QUERY_PARAM = "invite";

export type TournamentKind = "tournament" | "open";

export function tournamentBasePath(kind: TournamentKind, id: string): string {
  return kind === "open"
    ? `/open-tournaments/${encodeURIComponent(id)}`
    : `/tournaments/${encodeURIComponent(id)}`;
}

export function buildTournamentInvitePath(
  kind: TournamentKind,
  id: string,
  token: string,
): string {
  const params = new URLSearchParams({ [TOURNAMENT_INVITE_QUERY_PARAM]: token });
  return `${tournamentBasePath(kind, id)}?${params.toString()}`;
}

export function buildTournamentInviteUrl(
  origin: string,
  kind: TournamentKind,
  id: string,
  token: string,
): string {
  return new URL(buildTournamentInvitePath(kind, id, token), origin).toString();
}

export function getTournamentInviteToken(
  searchParams: { get(name: string): string | null } | null | undefined,
): string | null {
  const raw = searchParams?.get(TOURNAMENT_INVITE_QUERY_PARAM)?.trim() ?? "";
  return /^[a-f0-9]{16,64}$/i.test(raw) ? raw : null;
}
