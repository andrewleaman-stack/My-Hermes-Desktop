import { describe, expect, it } from "vitest";
import { detectPlatformKind, shouldShowWindowMenu } from "./platform";

describe("detectPlatformKind", () => {
  it("detects macOS from navigator-style platform strings", () => {
    expect(detectPlatformKind("MacIntel")).toBe("macos");
  });

  it("detects Windows from navigator-style platform strings", () => {
    expect(detectPlatformKind("Win32")).toBe("windows");
  });

  it("treats other desktop platforms as Linux-style chrome", () => {
    expect(detectPlatformKind("Linux x86_64")).toBe("linux");
  });
});

describe("shouldShowWindowMenu", () => {
  it("keeps menu labels out of macOS windows because the system owns the app menu", () => {
    expect(shouldShowWindowMenu("macos")).toBe(false);
  });

  it("shows menu labels inside Windows and Linux title bars", () => {
    expect(shouldShowWindowMenu("windows")).toBe(true);
    expect(shouldShowWindowMenu("linux")).toBe(true);
  });
});
