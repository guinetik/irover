# Typography

The app loads **IBM Plex Sans** for UI copy and HUD chrome. **Instrumentation** (numeric readouts) uses **[Datatype](https://fonts.google.com/specimen/Datatype)** via `--font-instrument` (loaded from Google Fonts in `index.html`).

## CSS variables (`src/assets/main.css`)

| Variable                     | Stack |
|------------------------------|--------|
| `--font-ui`                  | IBM Plex Sans, system UI sans-serifs |
| `--font-mono`                | IBM Plex Mono, system monospace |
| `--font-instrument`          | Datatype, fallbacks |
| `--font-instrument-weight`   | Optional override (default **500** on `.font-instrument`) |

Root `#app` uses `--font-ui` with antialiasing enabled.

- Use `var(--font-ui)` for labels, buttons, prose.
- Use `var(--font-instrument)` or the global class **`font-instrument`** for numeric readouts (power Wh, sol clock, mast LAT/LON/AZ/EL, deployment %, ChemCam calibration %, science log metadata values, etc.).

## Google Fonts

Families are linked from `index.html` (weights 400 / 500 / 600). Adjust there if you add italic or other weights.

## Inline SVG

Where `font-family` must be a string on `<text>`, match the intent: **UI** → `IBM Plex Sans, sans-serif`; **numeric axis ticks** → `Datatype, sans-serif` (keep in sync with `--font-instrument`).
