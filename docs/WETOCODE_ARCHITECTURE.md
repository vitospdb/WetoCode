# WetoCode Refactor Architecture

Updated: 2026-07-16 (Asia/Shanghai)

## Process Boundary

```text
React renderer
  | xterm UI, product state, no filesystem or secret APIs
  v
preload fixed IPC bridge
  v
Electron main process
  | settings + safeStorage encrypted credentials
  | provider adapters, terminal lifecycle, diagnostics
  v
OpenCode server / SDK
  | sessions, tools, providers, PTYs
  v
Local shell and configured model services
```

## Terminal

The terminal is an OpenCode PTY, not a browser emulation. The renderer sends xterm input through one constrained IPC method. The main process forwards it to the authenticated localhost PTY socket, and receives output through the same session. `ResizeObserver` drives xterm fit; only changed rows/columns are sent to `pty.update`.

Terminal workspace preferences are stored alongside appearance preferences: height, collapse/maximize state, font size and validated palette overrides. They never contain terminal input or server connection details.

## Model Registry Target

The model registry will normalize OpenCode/provider discovery and user-configured OpenAI-compatible services into a single record. Provider adapters remain in the main process and own authentication, timeout, error formatting and secret redaction. The renderer receives only model metadata and availability, never API keys.

`free` is a three-state pricing claim: confirmed free, paid, or unknown. Unknown pricing never enters the free filter. For OpenAI Compatible services, discovery calls their actual `/models` endpoint; for OpenCode services it uses the SDK model directory. A configured model remains visible as an explicit fallback when discovery fails.

## Appearance Target

Themes are token sets applied by the application root. Terminal palette and typography derive from the active token set but may be explicitly overridden in persisted appearance settings. Theme configuration is validated before it is stored or imported. Local background images are selected by native file picker; remote image URLs are rejected.

## First Run And Diagnostics

The first-run state is stored in application settings and opens only for a new user with no recent project. Environment checks run bounded, read-only version commands through the main process and return Chinese descriptions for missing commands such as `spawn ENOENT`. Automatic installation, registry edits and PATH changes are intentionally out of scope; they require an explicit user-approved repair workflow.
