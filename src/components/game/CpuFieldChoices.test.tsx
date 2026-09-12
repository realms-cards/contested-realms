import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CpuFieldChoices from "@/components/game/CpuFieldChoices";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";

beforeEach(() => {vi.stubGlobal("React",React);});
afterEach(() => {cleanup();vi.unstubAllGlobals();});
const choices = [{key:"a",label:"Rubble at Tile #13",boardTiles:["2,2"]},{key:"b",label:"Rubble at Tile #18",boardTiles:["2,3"]}];
it("does not capture normal board clicks until ability targeting is requested", () => {
  render(<CpuFieldChoices manual request="ability" choices={choices} value="" onChange={vi.fn()} id="test" />);
  expect(useCpuBoardPicker.getState().tiles).toEqual([]);
  fireEvent.click(screen.getByRole("button",{name:"Choose an ability target on the board"}));
  expect(useCpuBoardPicker.getState().tiles).toEqual(["2,2","2,3"]);
  fireEvent.click(screen.getByRole("button",{name:"Cancel board targeting"}));
  expect(useCpuBoardPicker.getState().tiles).toEqual([]);
});
it("requires a field click instead of listing all destination tiles", () => {
  const change = vi.fn();
  render(<CpuFieldChoices request="geomancer" choices={choices} value="" onChange={change} id="test" />);
  expect(screen.queryByRole("option",{name:choices[0].label})).toBeNull();
  expect(useCpuBoardPicker.getState().tiles).toEqual(["2,2","2,3"]);
  act(() => useCpuBoardPicker.getState().select("2,2"));
  expect(change).toHaveBeenCalledWith("a");
  expect(screen.getByRole("option",{name:choices[0].label})).toBeTruthy();
  expect(screen.queryByRole("option",{name:choices[1].label})).toBeNull();
  act(() => useCpuBoardPicker.getState().select("4,0"));
  expect(useCpuBoardPicker.getState().selected).toBe("2,2");
});
it("retains choices sharing a field and clears highlights on unmount", () => {
  const change = vi.fn();
  const view = render(<CpuFieldChoices request="desert" choices={[choices[0],{...choices[0],key:"other",label:"Other effect"}]} value="" onChange={change} id="test" />);
  act(() => useCpuBoardPicker.getState().select("2,2"));
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"),{target:{value:"other"}});
  expect(change).toHaveBeenCalledWith("other");
  view.unmount();
  expect(useCpuBoardPicker.getState().tiles).toEqual([]);
});
