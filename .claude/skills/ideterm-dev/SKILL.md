---
name: ideterm-dev
description: >-
  Use when developing, debugging, building, testing, or extending Mayo's IdeTerm
  (this Electron desktop app). Covers the architecture, the dev/build/test commands,
  the window.api IPC bridge pattern (and how to add a channel), the data model
  (global config vs per-snapshot workspace), the session-snapshot and terminal-tiling
  models, fs sandboxing, conventions, and the cross-platform/native-module gotchas.
---

# Developing Mayo's IdeTerm

A cross-platform Electron control center that launches/orchestrates IDEs, terminals, repos, and
coding agents. Stack: **electron-vite + React 18 + TypeScript**, xterm.js + `@lydell/node-pty`,
`simple-git`, CodeMirror 6, `react-resizable-panels`.

## Commands

```bash
npm run dev        # launch with HMR (electron-vite dev)
npm run typecheck  # tsc for node (main/preload) AND web (renderer)
npm test           # Vitest unit tests (test/*.test.ts)
npm run check      # typecheck + test  (run before committing)
npm run build      # typecheck + bundle to out/   (always run before electron-builder)
npm run dist:win   # local Windows installer (fails locally — see gotchas; use CI)
npm run make-icons # regenerate build/icon.png + icon.ico from build/icon.svg
```

## Process model & layout

Three processes; the renderer only talks to main through the typed `window.api` bridge
(`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`).

```
src/shared/   types.ts (all shared types) + api.ts (the window.api contract)
src/main/     index.ts (window, native File menu, save-on-close flush, lifecycle)
              store.ts (global ideterm.json), ipc.ts (all ipcMain handlers)
              services/ tools, launcher, launchCommand*, git, pty, fs, pathSafety*,
                        session, ssh, updates, version*   (* = pure, unit-tested)
src/preload/  index.ts -> contextBridge.exposeInMainWorld('api', ...) ; index.d.ts (Window.api)
src/renderer/ src/state/ AppState (global: tools/commands/settings),
                         Session (per-snapshot: projects + open UI state),
                         Terminals (pty sessions, tile groups, dock, floating)
              src/views/ Projects/Tools/Sessions(Terminals)/Files/Settings
              src/terminal/ TerminalView, TileLayout, TerminalDock, FloatingPanel,
                            termCache (xterm instances kept OUT of React), tileTree*
              src/files/ FileTree, FileEditor (CodeMirror); src/components/ shared UI
test/         Vitest suites mirroring the pure service/helper modules
```

## Adding an IPC channel (the core pattern)

To expose new main-process capability to the UI, edit **four** places in lockstep:
1. `src/main/services/<x>.ts` — the implementation.
2. `src/main/ipc.ts` — `ipcMain.handle('<ns>:<verb>', ...)` (use `ipcMain.on` for hot, fire-and-forget channels like `pty:write`).
3. `src/preload/index.ts` — add to the `api` object: `<ns>: { verb: (..) => ipcRenderer.invoke('<ns>:<verb>', ..) }`.
4. `src/shared/api.ts` — add the method signature to `IdeTermApi` (this is what makes `window.api` typed in the renderer).

For main→renderer events, `webContents.send('chan', payload)` in main and expose an
`on<Event>(cb): () => void` unsubscribe helper in preload (see `pty.onData`, `session.onMenu`).

## Data model (important)

- **Global** `ideterm.json` (`store.ts`, `PersistedState`): tools, savedCommands, settings, and the
  `snapshots` registry (dir/recent/lastOpened/restoreMode/cleanShutdown). **No projects here.**
- **Per-snapshot** `*.ideterm-session.json` (`services/session.ts`, `SessionSnapshot`): the Projects
  (folder collections) + open UI state (active view, selected project, open file tabs, serialized
  terminal tile layout, floating panels, dock). This is the Burp-style "project on disk".
- The renderer's `SessionProvider` owns the live snapshot; it autosaves every 60s and on close, and
  pushes folder roots to main via `session.setRoots` so `fs.ts` can sandbox file ops.

## Key conventions

- **Put pure logic in its own module and unit-test it.** Examples: `launchCommand.ts`,
  `pathSafety.ts`, `version.ts`, `terminal/tileTree.ts`. Keep Electron/native imports out of these
  so tests don't need a runtime. Add a `test/<name>.test.ts` for new pure logic.
- All file operations go through `services/fs.ts`, which **rejects paths outside the active
  snapshot's project roots** (`isPathInsideRoots`). Don't bypass it.
- Launch model (`launchCommand.ts` `launchMode`): `external` (detached window), `shell` (the exe IS
  the embedded terminal), `command` (run default shell, type the command). Spawn external apps with
  `shell:true` so Windows `.cmd` shims work.
- xterm instances live in `terminal/termCache.ts` keyed by session id, NOT in React state — so
  scrollback survives tab switches / re-mounts. Dispose via `disposeTerminal` on close.
- Use `window.prompt` is unreliable in Electron — use the `Prompt`/`Modal` components instead.
- Main process is ESM (`"type":"module"`); derive dirs from `import.meta.url`; preload builds to
  `out/preload/index.mjs`.

## Gotchas / hard-won lessons

- **node-pty**: use `@lydell/node-pty` (N-API prebuilds) — ABI-stable across Node *and* Electron,
  **no compiler / no Visual Studio**. Do NOT add canonical `node-pty` or an `install-app-deps`
  postinstall (it invokes node-gyp and breaks installs).
- **Vitest must stay on v2** (vite-5 compatible). Vitest 4 drags in a second esbuild (0.28 via
  vite 7) that desyncs `package-lock.json` and breaks `npm ci` on CI.
- **Local `electron-builder --win` fails** with a winCodeSign symlink-privilege error (no Developer
  Mode/admin). Build installers via the GitHub Actions release workflow instead (see `ideterm-release`).
- A production **Content-Security-Policy is not set yet** (Electron shows a dev-only warning,
  suppressed when packaged) — tracked follow-up.

## Verifying a change

Run `npm run check && npm run build`. For runtime behavior, `npm run dev` (or boot the built app
with `ELECTRON_ENABLE_LOGGING=1 npx electron .` and read the renderer console for errors). The
native PTY can be smoke-tested headlessly by `require('@lydell/node-pty').spawn(...)` under Electron.
