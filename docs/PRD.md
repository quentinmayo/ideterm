# Mayo's IdeTerm — Product Requirements Document

**Tagline:** One control center for your IDEs, terminals, repos, and coding agents.

## Overview

Mayo's IdeTerm is a cross-platform (Windows / macOS / Linux) Electron desktop app that acts as a
control center for IDEs, terminals, and multi-folder engineering projects. It does not replace
VS Code, Cursor, Warp, or Claude Code — it coordinates them.

## Problem statement

Engineers work across many folders, repos, terminals, IDEs, and AI coding tools at once. Existing
IDEs assume a single workspace tree; AI coding tools often abstract away the source. IdeTerm lets
an engineer define a project made of many folders and launch the right IDE, terminal, or agent
against each folder — while still inspecting source and Git state directly.

## Target users

Developers and platform/DevOps engineers who juggle multiple repos, services, and tools
simultaneously (e.g. a frontend, backend, scanner service, and infra repo in one initiative).

## Product goals

1. Make "a project = many folders" a first-class concept.
2. Launch any executable/app with configurable flags against any folder.
3. Surface live Git status and basic Git actions per folder.
4. Provide embedded terminals that can be split, docked, and floated.
5. Offer lightweight in-app file navigation and editing.
6. Run identically on Windows, macOS, and Ubuntu/Linux with no compiler toolchain to install.

## Non-goals

Not a full IDE (no LSP, extensions, debugger, or project-wide search). Not a replacement for AI
tooling. No remote/SSH project sync (the SSH builder opens a local terminal only). No plugin
system, no auto-update server. Single window.

## Core user flows

1. **First run** → tools auto-detected; user adds any custom tool (path + flags).
2. **Create a project** → name it, add folders; each folder shows Git status.
3. **Work a folder** → right-click → open in IDE / open terminal / run agent / run command / Git.
4. **Terminals** → split row/column, float a pane, rename, restart, save a command.
5. **Git** → stage, commit, push/pull, view diffs inline.
6. **Files** → browse a folder, edit and save, create/rename/move/delete.
7. **SSH** → build a command, see the local-only warning, run it or save it.

## MVP features

Tool detection & custom tools; projects of folders; per-folder Git status; right-click actions;
generic launcher (external / embedded shell / embedded command); embedded terminals with recursive
tiling + dock + float; inline Git UI; file tree + lightweight editor; SSH command builder.

## Tool detection requirements

`process.platform` selects a probe table. For each known tool: resolve on PATH (`where`/`which`),
then probe known install locations. Detected tools get sensible defaults (type, launch mode,
folder-arg position, icon) and merge by id with user-saved/overridden tools.

## Project / workspace model

`Project { id, name, color, folders: ProjectFolder[], createdAt }`,
`ProjectFolder { id, path, name }`. Persisted as a single version-stamped JSON file in the OS
user-data directory, written atomically.

## Terminal session model

A session is one PTY (via `@lydell/node-pty`) bound to one xterm instance. Sessions are grouped
into dock **tabs**; each tab is a recursive **tile tree** (leaf = session, split = row/column with
draggable dividers). Sessions can be floated into draggable/resizable panels and docked back.
xterm instances are cached outside React so scrollback survives layout changes.

`Tool.launchMode`: `external` (detached OS process), `shell` (the executable runs as the embedded
terminal), or `command` (the default shell runs and the tool's command is typed in).

## Git integration

Per folder: is-repo, branch, ahead/behind, staged/modified/untracked/conflicted counts, dirty
flag, last commit. Actions: refresh, stage/unstage (single + all), commit, push, pull, fetch,
per-file diff vs HEAD, copy branch, open in IDE. Backed by `simple-git`.

## UI/UX requirements

Dark, dense, developer-focused. Left nav rail: Projects / Tools / Sessions / Files / Settings.
Global bottom terminal dock toggled with `Ctrl/Cmd+\``. Custom (non-native) context menus, modals,
and toasts for visual consistency.

## Settings and configuration

Default shell for new terminals, terminal font size, theme, dock visibility. Persisted with the
rest of the state.

## Technical architecture

electron-vite + React + TypeScript. Main process owns all privileged work (fs, child_process,
git, pty) and exposes a typed `window.api` via a `contextIsolation` preload bridge. Renderer is
pure UI. Native terminal support uses N-API prebuilt binaries — no `node-gyp`, no Visual Studio.

## Data model

`PersistedState { version, projects, tools, savedCommands, settings }`. Runtime-only:
`TerminalSession`, tile trees, floating panels. See `src/shared/types.ts`.

## Security considerations

contextIsolation on / nodeIntegration off; path validation for all folder/exe operations;
`spawn` with arg arrays (dangerous flags are user-configured, never auto-applied); file operations
sandboxed to project roots; external navigation denied; PTYs killed on quit. SSH sessions are
local-terminal-only. A production CSP is a tracked follow-up.

## Future features

Project-wide search; per-tool environment overrides; session persistence/restore across restarts;
remote/SSH-aware projects; theming; auto-update; a plugin API; Git stash/branch-switch UI.

## Acceptance criteria

- Launches via `npm run dev`; `npm run typecheck` and `npm run build` pass clean.
- Tools auto-detected; custom tool can be added, edited, removed, and launched.
- A project with ≥2 folders shows correct Git status per folder; refresh works.
- Right-click opens a folder in an external IDE and an embedded terminal at that cwd.
- Terminals support recursive split, dock + float, rename, kill, restart, saved command.
- Inline Git can stage/unstage, commit, push, and pull on a real repo.
- File tree can open/edit/save and create/rename/move/delete.
- SSH builder composes a valid command, shows the local-only warning, and runs/saves it.
- Installs and runs on Windows, macOS, and Linux without a compiler present.
- State persists across restarts.
