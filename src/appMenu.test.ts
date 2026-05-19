import { describe, expect, it } from "vitest";
import { getWindowMenu } from "./appMenu";

describe("getWindowMenu", () => {
  it("returns no in-window menu sections on macOS", () => {
    expect(getWindowMenu("macos")).toEqual([]);
  });

  it("returns Codex-style in-window menu sections on Windows", () => {
    expect(getWindowMenu("windows").map((section) => section.label)).toEqual([
      "文件",
      "编辑",
      "查看",
      "Agent",
      "窗口",
      "帮助",
    ]);
  });
});
