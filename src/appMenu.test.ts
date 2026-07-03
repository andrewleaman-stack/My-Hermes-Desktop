import { describe, expect, it } from "vitest";
import { getWindowMenu } from "./appMenu";

describe("getWindowMenu", () => {
  it("returns no in-window menu sections on macOS", () => {
    expect(getWindowMenu("macos")).toEqual([]);
  });

  it("returns Codex-style in-window menu sections on Windows", () => {
    expect(getWindowMenu("windows").map((section) => section.label)).toEqual([
      "Files",
      "Edit",
      "View",
      "Agent",
      "Window",
      "Help",
    ]);
  });
});
