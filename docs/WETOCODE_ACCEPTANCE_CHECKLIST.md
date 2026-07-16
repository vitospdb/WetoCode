# WetoCode Acceptance Checklist

Updated: 2026-07-16 (Asia/Shanghai)

Legend: `done` = implemented; `verified` = passed in this workspace; `pending` = not delivered; `blocked` = requires an unavailable environment.

| Area | Status | Evidence / next action |
| --- | --- | --- |
| App starts | verified | React bootstrap and Electron remote-debug page load in baseline smoke. |
| Existing sessions and projects | verified | Existing OpenCode SDK/session paths retained; no migration performed. |
| Real PTY | verified | `npm run smoke:pty` passed on 2026-07-16. |
| Chinese IME | verified | xterm native composition path is used without composition-end reinjection; Electron smoke passed. |
| Chinese/multiline paste and copy | verified | Ctrl+Shift+V, Shift+Insert, toolbar and context-menu paste; multi-line confirmation; Electron smoke passed. |
| UTF-8 shell/CLI output | verified | PTY is byte-safe WebSocket text; Windows ConPTY requires native verification. |
| Terminal resize, maximize, restore, persistence | verified | Persisted height, drag handle, collapse and workspace maximize/restore are implemented; Electron smoke passed. |
| PTY rows/cols follow fitted terminal | verified | Fit is frame-coalesced and only changed rows/cols call real `pty.update`. |
| Chinese WetoCode CLI branding | verified | Existing brand filter and terminal brand tests pass. |
| Dynamic connected-provider models | verified | OpenCode SDK directory and OpenAI Compatible `/models` discovery are cached in the main process; configured fallback is explicit. |
| Free filter and unknown-price state | verified | Free requires zero official prices, official `free` identifier, or explicit internal rule; unknown is excluded from free filter. |
| Key storage/redaction | verified | Electron safeStorage boundary and sanitized renderer settings are present. |
| Five original themes/customization | verified | Weto dark, cloud light, strawberry cream, minimal silver and forest care; colors, terminal palette/size, local background, import/export and restart persistence are implemented. |
| Beginner first-run flow/environment doctor | verified | Five-step Chinese onboarding and read-only environment doctor passed Electron smoke. |
| Unit tests | verified | 19 files / 71 tests passed on 2026-07-16. |
| Lint and production build | verified | Passed after all changes on 2026-07-16. |
| Electron terminal UI smoke | verified | Real terminal, IME, paste, shell, resize/maximize, model-center and theme checks passed on 2026-07-16. |
| Windows desktop build | blocked | Must run on native Windows per project packaging requirements. |

## Packaging Note

`npm run dist:win` completed the renderer build and prepared the Windows x64 OpenCode engine, then intentionally stopped in `scripts/build-win.mjs` because the current host is Linux/WSL. `npm run dist:dir` generated `release/linux-unpacked` and its current `app.asar`, but Electron Builder did not exit within the five-minute verification limit, so directory packaging is not marked verified. Source Electron smoke tests are independently passing.
