# Hermes Desktop — Agent Rules

## Product North Star

Reduce the barrier to using Hermes Agent for users who are uncomfortable with terminals. Prefer zero-configuration install paths, low learning curve, and native-feeling interaction.

## Constraints

- Chat transport uses a persistent `tui_gateway.entry` JSON-RPC subprocess. Do not reintroduce per-message `hermes chat -q` spawning for normal chat turns.
- Slash commands may still need dedicated Tauri commands or Hermes subcommands unless explicitly supported by the gateway RPC surface.
- Keep platform-specific logic behind target-specific guards.
