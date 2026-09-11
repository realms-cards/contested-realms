import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuMatchSetup from "@/components/game/CpuMatchSetup";

const mocks = vi.hoisted(() => ({ startCpuMatch: vi.fn(), replace: vi.fn(), leaveMatch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({replace:mocks.replace,push:vi.fn()}) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({data:{user:{id:"patron"}},status:"authenticated"}) }));
vi.mock("@/lib/patrons", () => ({fetchPatrons:async () => [],isPatron:() => true}));
vi.mock("@/app/online/online-context", () => ({useOnline:() => ({connected:true,match:null,startCpuMatch:mocks.startCpuMatch,leaveMatch:mocks.leaveMatch})}));

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("CPU mode entry points", () => {
  it.each(["precon", "goldfish"] as const)("requests the %s mode explicitly", async mode => {
    render(<CpuMatchSetup mode={mode} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole("heading", {name:mode === "precon" ? "VS CPU Precons" : "Goldfish — Test Any Deck"})).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(mode === "precon" ? "/play/goldfish" : "/play/vs-cpu");
    fireEvent.click(screen.getByRole("button",{name:"Start game"}));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.startCpuMatch).toHaveBeenCalledWith(undefined,mode);
    expect(mocks.startCpuMatch).toHaveBeenCalledTimes(1);
  });
  it("does not create a match after leaving setup", async () => {
    const view = render(<CpuMatchSetup mode="goldfish" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    fireEvent.click(screen.getByRole("button",{name:"Start game"}));
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.startCpuMatch).not.toHaveBeenCalled();
  });
});
