import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import Icon from "../Icon";

/** Fired after a successful profile switch so ChatPage can reset state. */
export const PROFILE_CHANGED_EVENT = "hermes-profile-changed";

/**
 * Agent profile switcher. Profiles are ~/.hermes/profiles/<name> homes
 * (own SOUL, config, sessions, memory); "default" is the base ~/.hermes.
 * Switching kills the gateway so the next message runs as the new agent.
 */
export default function ProfilePicker() {
  const [profiles, setProfiles] = useState<string[]>(["default"]);
  const [current, setCurrent] = useState("default");
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<string[]>("list_hermes_profiles").then(setProfiles).catch(() => {});
    invoke<string>("get_hermes_profile").then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const switchTo = async (name: string) => {
    setOpen(false);
    if (name === current || switching) return;
    setSwitching(true);
    try {
      await invoke("set_hermes_profile", { name });
      setCurrent(name);
      window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, { detail: name }));
    } catch {
      // keep previous selection on failure
    } finally {
      setSwitching(false);
    }
  };

  // Nothing to switch between — stay out of the way.
  if (profiles.length <= 1) return null;

  return (
    <div className="profile-picker" ref={rootRef}>
      <button
        className="topbar-terminal-btn"
        onClick={() => setOpen((v) => !v)}
        title="Switch agent profile (own SOUL, sessions, and memory)"
        disabled={switching}
      >
        <Icon name="spark" size={13} />
        {switching ? "Switching…" : current}
      </button>
      {open && (
        <div className="profile-picker-menu">
          {profiles.map((name) => (
            <button
              key={name}
              className={`profile-picker-item${name === current ? " selected" : ""}`}
              onClick={() => switchTo(name)}
            >
              {name}
              {name === current && <Icon name="check" size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
