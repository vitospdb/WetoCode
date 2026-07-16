# WetoCode Refactor Plan

Updated: 2026-07-16 (Asia/Shanghai)

## Baseline Findings

- Desktop shell: Electron 43 with a sandboxed React 19 / Vite renderer. Electron Builder produces NSIS Windows artifacts.
- Agent integration: the Electron main process starts persistent `opencode serve` processes and uses the official OpenCode SDK. Sessions, tools, permissions, worktrees and streaming remain owned by OpenCode.
- Terminal: renderer uses `@xterm/xterm` 6 and `@xterm/addon-fit`; main process creates a real OpenCode PTY, connects it through a localhost WebSocket, and calls `pty.update` on resize. It is not a simulated textarea.
- Secret handling: provider keys are encrypted with Electron `safeStorage` in the main process. The preload API only exposes the `hasApiKey` state.
- Model source today: the task selector maps only `settings.providers`. The default settings intentionally contain only `wetocode-free / mimo-v2.5-free`; this explains the one-model list. Provider presets are configuration starters, not discovered models.
- Terminal defects: CSS reserves a fixed `42vh` terminal row and has no persisted drag/maximize/collapse state. The existing IME fallback may inject `compositionend.data` after `onData`, creating a duplicate-input race. Resize calls are not batched.

## Delivery Sequence

1. Completed: terminal workspace controls, IME duplicate-delivery removal and actual Electron automation.
2. Completed: provider-backed Model Registry with five-minute cache, strict price states, connection tests, favorites and a model-center view.
3. Completed: token-based original presets, terminal typography/palette overrides, local background selection, and validated import/export.
4. Completed: default first-run flow and read-only Chinese environment diagnostics. No system configuration is modified automatically.
5. In progress: lint, typecheck/build, unit tests, PTY/Electron smoke tests passed in this workspace. Native Windows package/build remains a Windows-only acceptance task.

## Constraints

- No replacement of Electron, OpenCode session handling or the secure-key boundary.
- No static list may be presented as live free-model discovery.
- Windows packaging can only be accepted after a native Windows execution; this Linux workspace cannot establish that result.
