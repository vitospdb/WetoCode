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
| UTF-8 shell/CLI output | verified | PTY is byte-safe WebSocket text; packaged Windows ConPTY workflow passed Chinese IME and paste checks. |
| Terminal resize, maximize, restore, persistence | verified | Persisted height, drag handle, collapse and workspace maximize/restore are implemented; Electron smoke passed. |
| PTY rows/cols follow fitted terminal | verified | Fit is frame-coalesced and only changed rows/cols call real `pty.update`. |
| Chinese WetoCode CLI branding | verified | Existing brand filter and terminal brand tests pass. |
| Dynamic connected-provider models | verified | OpenCode SDK directory and OpenAI Compatible `/models` discovery are cached in the main process; configured fallback is explicit. |
| Free filter and unknown-price state | verified | Free requires zero official prices, official `free` identifier, or explicit internal rule; unknown is excluded from free filter. |
| Key storage/redaction | verified | Electron safeStorage boundary and sanitized renderer settings are present. |
| Five original themes/customization | verified | Weto dark, cloud light, strawberry cream, minimal silver and forest care; colors, terminal palette/size, local background, import/export and restart persistence are implemented. |
| Beginner first-run flow/environment doctor | verified | Five-step Chinese onboarding and read-only environment doctor passed Electron smoke. |
| Unit tests | verified | 19 files / 77 tests passed on 2026-07-16. |
| Lint and production build | verified | Passed after all changes on 2026-07-16. |
| Electron terminal UI smoke | verified | Real terminal, IME, paste, shell, resize/maximize, model-center and theme checks passed on 2026-07-16. |
| Windows desktop build | verified | Native Windows 11 NSIS build of commit `7af9ad9` produced the final x64 installer. |
| Windows child-process cleanup | verified | In a session already affected by an older stale ConPTY record, final-package timeout cleanup left zero processes and zero TCP records for its engine path. Windows now terminates the complete OpenCode process tree before Node can report a premature child exit. |
| Final Windows normal-path PTY rerun | blocked | An older pre-fix package still owns stale PID 10336/port 8243; CIM terminate returns access denied (`2`) and OpenCode PTY creation stalls across isolated data directories. The earlier packaged workflow passed; repeat the final-package normal-path smoke after a clean Windows login. |

## Packaging Note

Native Windows 11 packaging was run with Windows Node 22 and Electron Builder. The final installer at `C:\WetoCodeBuild-7a06898\release-final-cleanup\WetoCode-Setup-0.2.8-x64.exe` has SHA-256 `eccdf0e55e1390c743db2ef524416bc24997bf39649f916d33c5ef9f970b1ae2`.

The current Windows session reports `WSALookupServiceBegin failed with: 10108` and contains stale kernel process/socket records from an earlier pre-fix package. Isolated XDG directories prevent configuration/database overlap, but cannot repair that system state. The final package returns `终端启动超时，请检查本地网络服务后重试。`, restores the UI to `未连接`, and leaves no new process or listener. A reboot or Winsock reset is intentionally not performed without explicit approval.
