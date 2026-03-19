# AGENTS.md

Repository-specific guidance for coding agents working in this project.

## Scope And Priority

- These rules apply to `/Users/maruti/Documents/Projects/music-player`.
- If instructions conflict, direct user instructions win, then this file, then `~/.codex/AGENTS.md`.

## Project Stack

- Frontend app: Vite + React (JavaScript, ESM).
- Entry points: `src/main.jsx`, `src/App.jsx`.
- Core state layer: `src/context/PlayerContext.jsx`.
- UI components: `src/components/`.
- Lint config: `eslint.config.js`.

## Working Rules

- Prefer minimal, targeted changes that preserve current structure and style.
- Do not add dependencies unless necessary and explicitly justified.
- Keep logic in React function components/hooks and existing context patterns.
- Avoid unrelated refactors while fixing features or bugs.
- Do not modify generated build output in `dist/` unless user explicitly asks.

## Validation Commands

- Install deps: `npm install`
- Run dev server: `npm run dev`
- Lint: `npm run lint`
- Production build: `npm run build`
- Preview build: `npm run preview`

## Testing And Verification

- For behavior/code changes, run `npm run lint` first.
- Run `npm run build` when changes could affect bundling/runtime behavior.
- If checks cannot be run, state what was skipped and why.

## Documentation

- Update `README.md` when changing user-visible behavior or setup steps.
- Keep instructions concrete and command-focused.
