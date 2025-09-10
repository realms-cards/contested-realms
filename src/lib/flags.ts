export const FEATURE_SEAT_VIDEO: boolean = (process.env.NEXT_PUBLIC_FEATURE_SEAT_VIDEO || "").toLowerCase() === "true";

function parseIceServersFromEnv(): RTCIceServer[] | null {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (raw && typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RTCIceServer[];
    } catch {
      // fall through to TURN/STUN defaults
    }
  }
  return null;
}

function buildDefaultIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl && typeof turnUrl === 'string' && turnUrl.trim().length > 0) {
    const username = process.env.NEXT_PUBLIC_TURN_USERNAME || '';
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '';
    servers.push({ urls: [turnUrl], username, credential });
  }
  return servers;
}

export const RTC_STUN_SERVERS: RTCIceServer[] =
  parseIceServersFromEnv() || buildDefaultIceServers();
