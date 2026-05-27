# Mayo's IdeTerm

**One control center for your IDEs, terminals, repos, and coding agents.**

Mayo's IdeTerm is a cross-platform Electron desktop app that *coordinates* the tools you
already use — VS Code, Cursor, Warp, Claude Code, your shells — instead of replacing them.
Define a **project** as a collection of folders, see live Git status for each, and launch the
right tool, terminal, or agent against any folder from one place.

> It is not another editor. It is the layer above your editors.

---

## Why

Engineers work across many folders, repos, terminals, and AI tools at once, but IDEs assume a
single workspace tree. IdeTerm makes the unit of work a **project of many folders**, each with
its own Git state and one-click actions to open whatever tool fits.

## Features

- **Generic tool launcher** — point IdeTerm at *any* executable + flags. Detected automatically:
  VS Code, Cursor, Warp, Claude Code, Windows Terminal, PowerShell/pwsh, Git Bash, WSL (Windows);
  VS Code/Cursor/Warp/iTerm/Terminal + your `$SHELL` (macOS); VS Code/Cursor/GNOME Terminal/Konsole
  + `$SHELL` (Linux). Add custom tools with name, path, args, icon, type, and launch mode.
- **Projects** — named collections of folders, each showing branch, dirty/clean, staged/modified/
  untracked counts, ahead/behind, and the last commit.
- **Right-click folder actions** — open in any IDE, open a terminal here, run an agent, run a saved
  command, view Git, pull, copy path/branch, reveal in OS explorer, open in the in-app file tree.
- **Embedded terminals** — real PTY-backed terminals (xterm.js) docked at the bottom, with
  **recursive split tiling** (split any pane row/column, drag to resize), draggable/resizable
  **floating** panels, rename, kill, restart, and saved commands. Scrollback survives tab switches.
- **Inline Git** — stage/unstage files, write a commit message, commit, push, pull, fetch, view
  per-file diffs, copy branch, open the repo in your IDE.
- **File tree + editor** — browse, open, edit (CodeMirror 6), and save files; create, rename,
  delete, and drag-to-move files and folders. Intentionally lighter than a full IDE.
- **SSH command builder** — assemble an `ssh` command from a form and run it in an embedded
  terminal or save it as a reusable command, with a clear *local-only* warning (see below).

## Tech

electron-vite · React + TypeScript · xterm.js · [`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty)
(N-API prebuilds — **no compiler / no Visual Studio required**) · `simple-git` ·
`react-resizable-panels` · CodeMirror 6.

## Getting started

```bash
npm install        # no native compilation — prebuilt PTY binaries per platform
npm run dev        # launch in development with HMR
npm run build      # typecheck + bundle to out/
npm run dist       # build an installer for the current OS (nsis / dmg / AppImage)
```

Requirements: Node 18+ and Git on PATH. Windows, macOS, and Ubuntu/Linux are all supported.
The terminal backend uses N-API prebuilt binaries, so installing does **not** invoke `node-gyp`
or require Visual Studio / build tools.

## Architecture

```
src/
  shared/    Types + the window.api contract (no Node/DOM imports)
  main/      Electron main: JSON store, tool detection, git, launcher, pty, fs, ssh, IPC
  preload/   contextBridge -> window.api (contextIsolation on, nodeIntegration off)
  renderer/  React UI: nav, projects, tools, sessions, files, settings + terminal tiling
```

All privileged work happens in the main process; the renderer only talks through the typed
`window.api` bridge. File operations are sandboxed to your configured project-folder roots.

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`; the renderer never touches `fs`/`child_process`.
- External links open in the OS browser; arbitrary `window.open` and navigation are denied.
- File-system operations are restricted to paths inside your project folders.
- The **SSH builder opens a local terminal session only**. Your IDEs, agents, and the file tree
  keep operating on the local machine — they are **not** connected to the remote host.
- **Known follow-up:** a production Content-Security-Policy is not yet set (Electron shows a
  dev-only warning that is suppressed in packaged builds). Add a CSP before distributing.

## License

MIT
