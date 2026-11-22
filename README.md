# lesson-replay

The code that reads and draws a recorded lesson: the board, the live quiz games (race and Quest), and the
timeline and clock the player runs on. It is a Svelte 5 source library with no app and no build of its own:
the web app imports it, and streamer-rs takes fonts, strings and the logo from it for the lesson video.

## Layout

| Path                           | What it is                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/replay/`              | the library: `board/`, `quiz/`, `player/`, `stages/`, `export/` (the quiz screens as a still image, and the logo), `i18n/` |
| `src/app.css`, `static/fonts/` | sui's theme and the fonts the board and the video draw with (streamer-rs copies the fonts)                                 |
| `src/app.html`                 | the template `svelte-kit sync` needs for `check`; there is no page                                                         |
| `vendor/sui`                   | git submodule, [sui](https://github.com/iamleson98/sui) (component library). The replay imports only its button and `cn`   |
| `tests/unit/`                  | vitest: the import boundary, the dictionaries, the submodule pin and the logic of the folder                               |
| `scripts/`                     | `check-upstream-name.sh`                                                                                                   |

`src/lib/replay` is self-contained on purpose: it imports itself, `svelte`, `#lib/sui/*`, `#lib/utils.js` and
npm packages, nothing of an application (`tests/unit/replay-boundary.test.ts` enforces it). The `#lib/...`
aliases are the `imports` of `package.json`, as in sui.

## How it is used

- **The web app** mounts this repository as a git submodule, the way it mounts sui, and imports
  `#lib/replay/*` from it for its lesson player.
- **The render worker** (streamer-rs) draws the video natively in Rust, with no browser. It mounts this
  repository as a submodule for the board fonts (`static/fonts/*.woff2`), the replay strings (`i18n/en.ts`,
  `vi.ts`) and the logo (`export/logo.svg`), which its image build and crates embed, and for its parity
  tools, which bundle `app.css`, the quiz screens, the player and the board drawing here and compare the
  native frames with them. A change that alters what the video shows needs a streamer-rs pointer bump.

## Checks

```bash
git submodule update --init
bun install --frozen-lockfile     # bun 1.4.3
bun run check                     # svelte-check
bun run lint
bun run format:check
bun run test
scripts/check-upstream-name.sh
```

CI runs the same as the jobs `Check`, `Test`, `Name check` and `Secret scan`.

## Licence

MIT or Apache-2.0, at your option ([LICENSE-MIT](LICENSE-MIT), [LICENSE-APACHE](LICENSE-APACHE)).
