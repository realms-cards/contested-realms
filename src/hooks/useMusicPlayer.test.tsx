import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jsdom does not implement media playback. This fake follows the browser rules
 * the music player depends on: play() marks the element as not paused right
 * away and settles later, while pause() or a new src aborts a pending play()
 * with an AbortError.
 */
type PendingPlay = { resolve: () => void; reject: (reason: unknown) => void };
type FakeMedia = { paused: boolean; src: string; pending: PendingPlay | null };

const fakeMedia = new WeakMap<HTMLMediaElement, FakeMedia>();
let musicElements: HTMLMediaElement[] = [];

function mediaOf(el: HTMLMediaElement): FakeMedia {
  let media = fakeMedia.get(el);
  if (!media) {
    media = { paused: true, src: "", pending: null };
    fakeMedia.set(el, media);
  }
  return media;
}

function abortPending(media: FakeMedia): void {
  const pending = media.pending;
  if (!pending) return;
  media.pending = null;
  pending.reject(new DOMException("The play() request was interrupted", "AbortError"));
}

const originalPaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused");
const originalSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");

function installFakeMedia(): void {
  musicElements = [];
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return mediaOf(this).paused;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "src", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return mediaOf(this).src;
    },
    set(this: HTMLMediaElement, value: string) {
      const media = mediaOf(this);
      abortPending(media);
      media.paused = true;
      media.src = value;
      if (value.includes("/music/") && !musicElements.includes(this)) {
        musicElements.push(this);
      }
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    const media = mediaOf(this);
    abortPending(media);
    media.paused = false;
    return new Promise<void>((resolve, reject) => {
      media.pending = { resolve, reject };
    });
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    const media = mediaOf(this);
    media.paused = true;
    abortPending(media);
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
}

function restoreMedia(): void {
  vi.restoreAllMocks();
  if (originalPaused) Object.defineProperty(HTMLMediaElement.prototype, "paused", originalPaused);
  if (originalSrc) Object.defineProperty(HTMLMediaElement.prototype, "src", originalSrc);
}

function currentMusic(): HTMLMediaElement {
  const el = musicElements[musicElements.length - 1];
  if (!el) throw new Error("no music element was created");
  return el;
}

/** Let the pending play() on the music element start playing. */
function startPlayback(el: HTMLMediaElement): void {
  const media = mediaOf(el);
  const pending = media.pending;
  media.pending = null;
  pending?.resolve();
}

/** In-memory Storage; the player reads the bare `localStorage` global. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => {
      items.delete(key);
    },
    setItem: (key: string, value: string) => {
      items.set(key, String(value));
    },
  };
}

describe("music player", () => {
  beforeEach(() => {
    // Fresh module singletons (the player keeps its state at module scope);
    // React and Testing Library are imported after the reset so they match.
    vi.resetModules();
    vi.stubGlobal("localStorage", memoryStorage());
    installFakeMedia();
  });

  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    restoreMedia();
    vi.unstubAllGlobals();
  });

  it("starts music when Play is pressed while music is disabled", async () => {
    const { act, fireEvent, render, screen } = await import("@testing-library/react");
    const { default: AudioControls } = await import("@/components/game/AudioControls");
    const { SoundProvider } = await import("@/lib/contexts/SoundContext");

    render(
      <SoundProvider>
        <AudioControls enableMusic />
      </SoundProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open audio controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Play music" }));
    await act(async () => {
      startPlayback(currentMusic());
    });

    expect(currentMusic().paused).toBe(false);
    expect(localStorage.getItem("music:enabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Pause music" })).toBeTruthy();
  });

  it("pauses and remembers the choice when Pause is pressed", async () => {
    localStorage.setItem("music:enabled", "true");
    const { act, fireEvent, render, screen } = await import("@testing-library/react");
    const { default: AudioControls } = await import("@/components/game/AudioControls");
    const { SoundProvider } = await import("@/lib/contexts/SoundContext");

    render(
      <SoundProvider>
        <AudioControls enableMusic />
      </SoundProvider>,
    );
    await act(async () => {
      startPlayback(currentMusic());
    });

    fireEvent.click(screen.getByRole("button", { name: "Open audio controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause music" }));
    await act(async () => {});

    expect(currentMusic().paused).toBe(true);
    expect(localStorage.getItem("music:enabled")).toBe("false");
    expect(screen.getByRole("button", { name: "Play music" })).toBeTruthy();
  });

  it("moves on to the next track when a match screen restarted the playlist during the first play", async () => {
    localStorage.setItem("music:enabled", "true");
    const { act, render } = await import("@testing-library/react");
    const { useGameStore } = await import("@/lib/game/store");
    const { default: MusicGameSync } = await import("@/components/game/MusicGameSync");
    useGameStore.setState({ phase: "Setup", matchEnded: false });

    // Mounting starts playback, then the Setup phase resets to the starting
    // track, which interrupts that first play() request.
    render(<MusicGameSync myPlayerKey="p1" />);
    await act(async () => {});
    const audio = currentMusic();
    await act(async () => {
      startPlayback(audio);
    });
    expect(audio.paused).toBe(false);

    const firstTrack = audio.src;
    await act(async () => {
      audio.dispatchEvent(new Event("ended"));
    });

    expect(audio.src).not.toBe(firstTrack);
    expect(audio.paused).toBe(false);
  });
});
