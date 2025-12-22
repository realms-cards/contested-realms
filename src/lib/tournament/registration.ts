export type RegistrationMode = "fixed" | "open";

export type RegistrationSettings = {
  mode: RegistrationMode;
  locked: boolean;
};

export function getRegistrationSettings(
  settings: unknown
): RegistrationSettings {
  const raw =
    settings && typeof settings === "object"
      ? ((settings as Record<string, unknown>).registration as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const mode = raw?.mode === "open" ? "open" : "fixed";
  const locked = raw?.locked === true;
  return { mode, locked };
}

export function isActiveSeat(registration: {
  seatStatus?: string | null;
}): boolean {
  return registration.seatStatus !== "vacant";
}

export function countActiveSeats(
  registrations: Array<{ seatStatus?: string | null }>
): number {
  return registrations.filter(isActiveSeat).length;
}
