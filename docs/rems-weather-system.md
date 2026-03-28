# REMS weather and dust-storm notices

## Measurements

When REMS is **ACTIVATE** / surveying (`passiveSubsystemEnabled`), the mast booms report:

- **Pressure** (hPa) — site elevation and `featureType` bias the baseline (~Mars surface).
- **Humidity** (%) — driven by `waterIceIndex`, `silicateIndex`, `dustCover`.
- **Air temperature** (°C) — same diurnal curve as `useMarsThermal` / heater ambient, plus small stable sinusoidal jitter.
- **Wind** — speed (m/s) from `roughness`, `dustCover`, `featureType`; direction (° and compass **from** which wind blows, meteorological convention). During **dust storms** (incoming + active phases), wind ramps to a **level-based peak** (levels 1–5: Minor → Extreme) with large sinusoidal gusts; pressure drops, UV and humidity fall, air temp dips slightly.
- **UV index** — time-of-day and `dustCover`; heavily reduced during dust storms.

Implementation: `src/composables/useSiteRemsWeather.ts`, tick from `MarsSiteViewController` after `tickThermal`. Values are mirrored onto `REMSController` for other systems.

## UI when REMS is off

- **Sol clock** ambient segment is hidden (`solClockAmbientC === null`).
- **Heater card** AMBIENT shows an em dash with tooltip — air temperature is not measured without REMS.
- **REMS card** shows an offline hint instead of numeric readouts.

Thermal **physics** still uses the diurnal ambient model for internal rover temperature; only **displayed** ambient air depends on REMS.

## Dust storms (cosmetic)

Only while REMS is **on**: an idle timer rolls a site- and `dustCover`-weighted chance for **incoming** then **active** phases. Each event rolls a **storm level** 1–5 (shown in banners and on the REMS card). **Readouts** (wind especially) respond during incoming/active; there is still **no** power, mobility, or science penalty — presentation only.

## Site parameters

All inputs come from `TerrainParams` / `getTerrainParamsForSite` (`dustCover`, `elevation`, `roughness`, `waterIceIndex`, `silicateIndex`, `featureType`, `temperatureMinK` / `MaxK`, `seed`).
