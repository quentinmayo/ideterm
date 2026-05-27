# Working on Mayo's IdeTerm

Cross-platform Electron control center (electron-vite + React + TypeScript) that launches and
orchestrates IDEs, terminals, repos, and coding agents. See `README.md` for the product tour and
`docs/PRD.md` for requirements.

## Project skills

Two `.claude/skills/` guides cover how to work here — read the relevant one before non-trivial work:

- **`ideterm-dev`** — architecture, dev/build/test commands, the `window.api` IPC bridge pattern,
  data model (global config vs per-snapshot workspace), terminal-tiling & session-snapshot models,
  fs sandboxing, conventions, and native-module gotchas.
- **`ideterm-release`** — version bump → tag → GitHub Actions builds/publishes the Win/macOS/Linux
  installers (releases must build on CI, not locally).

## Quick reference

```bash
npm run dev     # run with HMR
npm run check   # typecheck + unit tests — run before committing
npm run build   # typecheck + bundle to out/
```

- Renderer talks to main only via the typed `window.api` bridge (`src/shared/api.ts`). Adding a
  capability touches `services/*` → `ipc.ts` → `preload/index.ts` → `shared/api.ts`.
- Keep pure logic in its own module with a `test/*.test.ts` (e.g. `launchCommand`, `pathSafety`,
  `version`, `tileTree`).
- PTY is `@lydell/node-pty` (N-API, no compiler). Keep Vitest on v2. Don't build installers locally.
