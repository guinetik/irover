# Inventory items catalog

## Location

- Data: [`public/data/inventory-items.json`](../public/data/inventory-items.json)
- Types and runtime catalog: [`src/types/inventory.ts`](../src/types/inventory.ts)

## JSON fields

| Field | Rocks | Components |
|--------|--------|----------------|
| `id` | Required; matches `RockTypeId` where applicable | Required; stable snake-case id |
| `category` | `"rock"` | `"component"` |
| `label` | Short UI name | Short UI name |
| `description` | Tooltip / detail copy | Tooltip / detail copy |
| `image` | Path under site root (e.g. `/basalt.jpg`) | Path to thumbnail (SVG/PNG/JPEG) |
| `weightRange` | `[minKg, maxKg]` per APXS sample | Omit |
| `weightPerUnit` | Omit | kg per unit (e.g. `0.25` for 250 g) |
| `maxStack` | Omit (count unlimited; limited by cargo mass only) | Max stack size (e.g. `500`) |

## Stacking

- **Rocks**: One stack per `id` (lithology). Each APXS success adds one sample mass (random in `weightRange`) and increments `quantity`. Stacking continues until total cargo mass would exceed capacity.
- **Components**: One stack per `id`, up to `maxStack` units, each `weightPerUnit` kg.

## Adding new items

1. Add a row to `inventory-items.json`.
2. Ensure `src/types/inventory.ts` still loads (catalog is built at module init; unknown ids are rejected at add-time if you validate).
3. Provide an `image` asset under `public/` if needed.
