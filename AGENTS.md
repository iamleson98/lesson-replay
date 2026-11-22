# AGENTS.md

Instructions for coding agents working in this repository. Humans start at `README.md`.

## What this is

The replay library (`src/lib/replay`), split out of the class-management web app: a source library with no
app, page or build. The web app imports it; streamer-rs takes the board fonts, the replay strings and the
logo from it and bundles its player, board and quiz screens in its parity tools, so those paths stay.
Svelte 5 (runes); SvelteKit is kept only for `svelte-kit sync`; sui consumed as source from `vendor/sui`.

## Rules

- `src/lib/replay` imports only itself, `svelte`, `#lib/sui/*`, `#lib/utils.js` and npm packages. Never an
  app alias, never a path out of the folder (`tests/unit/replay-boundary.test.ts`).
- Never edit `vendor/sui`: changes land in the sui repository, then the submodule pointer moves.
- Every user-facing string exists in both languages: `src/lib/replay/i18n/en.ts` and `vi.ts`.
- The product name of the chat server this code descends from stays out of the repository
  (`scripts/check-upstream-name.sh`).
- This repository is public: no secrets, tokens, internal hostnames or personal data, in code, tests,
  fixtures or logs.
- Quality over speed: no TODO stubs, dead code or commented-out code. Follow the surrounding code.
- Pin dependencies to exact versions; every GitHub Action to a full commit SHA.

## Gates

`bun run check`, `lint`, `format:check`, `test` and `scripts/check-upstream-name.sh`
(see `README.md`); run them and read the output before claiming work done.

## Git

Branch (`feat/...`, `fix/...`), open a pull request against `main`. Conventional Commits:
`type(scope): summary`, imperative, no trailing period; the body explains why. Stage explicit paths.
