import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardImage } from "@/components/game/OnlineMulliganScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const img = (container: HTMLElement) => container.querySelector("img") as HTMLImageElement;
/** the image's path and query (next/image renders an absolute URL) */
const src = (container: HTMLElement) => {
  const url = new URL(img(container).getAttribute("src") ?? "", "http://localhost");
  return url.pathname + url.search;
};

describe("mulligan card image", () => {
  it("retries a failed image once, after a short delay", () => {
    vi.useFakeTimers();
    const { container } = render(<CardImage src="/api/images/alp-sea_raider-b-s" alt="Sea Raider" fill unoptimized />);
    expect(src(container)).toBe("/api/images/alp-sea_raider-b-s");

    fireEvent.error(img(container));
    expect(src(container)).toBe("/api/images/alp-sea_raider-b-s");
    act(() => vi.advanceTimersByTime(1000));
    expect(src(container)).toBe("/api/images/alp-sea_raider-b-s?retry=1");

    // the retry failing too is final
    fireEvent.error(img(container));
    act(() => vi.advanceTimersByTime(5000));
    expect(src(container)).toBe("/api/images/alp-sea_raider-b-s?retry=1");
  });

  it("starts over for a new card", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CardImage src="/api/images/a" alt="A" fill unoptimized />);
    fireEvent.error(img(container));
    act(() => vi.advanceTimersByTime(1000));
    rerender(<CardImage src="/api/images/b" alt="B" fill unoptimized />);
    expect(src(container)).toBe("/api/images/b");
    fireEvent.error(img(container));
    act(() => vi.advanceTimersByTime(1000));
    expect(src(container)).toBe("/api/images/b?retry=1");
  });
});
