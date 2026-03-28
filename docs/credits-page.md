# Credits page

## Overview

The home screen links to **`/credits`**, implemented in `src/views/CreditsView.vue`. **Creator credit** (guinetik / site / GitHub repo) is fixed in the Vue template at the top of the page, separate from the JSON. Attribution entries below are loaded at runtime from **`public/data/credits.json`** so you can add authors and URLs without rebuilding for copy edits.

## Data file

| Field | Purpose |
|--------|---------|
| `version` | Integer schema version for future migrations. |
| `intro` | Optional paragraph shown under the page title. |
| `groups` | Sections each with `id`, `label`, and `items`. |

Each **item** may include:

- `title` — Short name of the asset or source.
- `author` — Creator, studio, or agency.
- `url` — Link to the model page, license, or documentation. Use `""` when unknown; the UI hides the link until you set a real URL.
- `asset` — Optional filename under `public/` for clarity.
- `license` — Optional shorthand (e.g. CC BY 4.0).
- `notes` — Clarifications or a second URL in plain text (e.g. official NASA page alongside Sketchfab).

TypeScript types live in `src/types/credits.ts`.

## Updating attribution

When you confirm the source for `desk.glb`, `terminal.glb`, `rocks.glb`, or `sci-fi_cargo_crate.glb`, replace the placeholder `author` and set `url` to the marketplace or Sketchfab page. Remove or shorten `notes` once the link is authoritative.
