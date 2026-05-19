export type PlatformKind = "macos" | "windows" | "linux";

export function detectPlatformKind(platform = navigator.platform): PlatformKind {
  const value = platform.toLowerCase();

  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  return "linux";
}

export function shouldShowWindowMenu(platform: PlatformKind): boolean {
  return platform !== "macos";
}
