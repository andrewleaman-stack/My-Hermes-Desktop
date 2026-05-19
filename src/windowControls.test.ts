import { describe, expect, it } from "vitest";
import capability from "../src-tauri/capabilities/default.json";

describe("window control permissions", () => {
  it("allows custom titlebar buttons to control the Tauri window", () => {
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-minimize",
        "core:window:allow-toggle-maximize",
        "core:window:allow-close",
        "core:window:allow-hide",
      ])
    );
  });
});
