# lesson-replay

The code that reads and draws a recorded lesson: the board, the live quiz games (race and Quest), the
timeline and clock the player runs on, and the exporter that renders a lesson to a video frame by frame.
It is a Svelte 5 library consumed as source, plus the small static app (`/render`) a headless browser
opens to export a lesson.

## Layout

| Path                                           | What it is                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/replay/`                              | the library: `board/`, `quiz/`, `player/`, `stages/`, `export/`, `i18n/` (its own en and vi dictionary)                  |
| `src/routes/render/`                           | the `/render` page: starts the export (`replay/export/start.ts`) and reports to the driver                               |
| `src/app.html`, `src/app.css`, `static/fonts/` | what the page needs: sui's theme and the Inter font the brand card draws with                                            |
| `vendor/sui`                                   | git submodule, [sui](https://github.com/iamleson98/sui) (component library). The replay imports only its button and `cn` |
| `tests/unit/`                                  | vitest: the import boundary, the dictionaries, the submodule pin and the logic of the folder                             |
| `scripts/`                                     | `verify-static.mjs` (the build contract), `check-upstream-name.sh`                                                       |

`src/lib/replay` is self-contained on purpose: it imports itself, `svelte`, `#lib/sui/*`, `#lib/utils.js` and
npm packages, nothing of an application (`tests/unit/replay-boundary.test.ts` enforces it). The `#lib/...`
aliases are the `imports` of `package.json`, as in sui.

## How it is used

- **The web app** mounts this repository as a git submodule, the way it mounts sui, and imports
  `#lib/replay/*` from it for its lesson player.
- **The render worker** (streamer-rs) mounts it as a submodule too and builds the static app: `bun run build`
  writes `build/`, whose `200.html` is the fallback page that serves `/render`. The worker opens
  `/render#api=/api/v4&token=...&recording=...&request=...&sink=/__sink` in a headless browser. An empty
  fragment makes the page report an error and nothing else.

## Checks

```bash
git submodule update --init
bun install --frozen-lockfile     # bun 1.4.3
bun run check                     # svelte-check
bun run lint
bun run format:check
bun run test
bun run build && bun run verify:static
scripts/check-upstream-name.sh
```

CI runs the same as the jobs `Check`, `Test`, `Build`, `Name check` and `Secret scan`.

## Licence

MIT or Apache-2.0, at your option ([LICENSE-MIT](LICENSE-MIT), [LICENSE-APACHE](LICENSE-APACHE)).
