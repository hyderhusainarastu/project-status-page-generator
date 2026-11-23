# project-status-page-generator

A dependency-free Node script that renders a phases-and-status JSON file to a static HTML status page and, with `--check`, fails CI when the checked-in page is stale.

## Using this in your project

- The status source of truth is `status.json` (shape: `status.schema.json`). The HTML page is generated output.
- To record progress, edit `status.json` only. Then regenerate:
  `node generate-status-page.mjs --input status.json --output status.html`
- Never hand-edit the generated HTML. Hand edits are overwritten and make `--check` fail.
- CI runs `node generate-status-page.mjs --input status.json --output status.html --check`. It writes nothing and fails if the page differs from a fresh render. Fix a failure by regenerating, then committing both files.
- Rules the script enforces: `schemaVersion` is `1`; phase numbers run `0, 1, 2, ...` in order; `current.phase` matches a phase number; every `state` is one of `planned`, `in_progress`, `blocked`, `complete`.
- Only mark a phase `complete` when its `confirmation` gate is actually met. Put proof in `evidence`. Do not invent evidence or dates.
- Exit codes: 0 success or up to date, 1 invalid input or stale page, 2 usage error.
- `--help` prints usage. No PROMPT.md: CLI.

## Working on this repo

- Setup: none. There are no dependencies. Node 18 or newer.
- Test: `npm test` (runs offline, uses `node:test`).
- The rendered example `examples/status.html` must stay in step with `examples/status.json`. After changing the generator, regenerate it:
  `node generate-status-page.mjs --input examples/status.json --output examples/status.html`
- Regenerate `docs/screenshot.png` only if the page layout changes.
- Keep `status.schema.json` in step with the checks in `validate()`.
