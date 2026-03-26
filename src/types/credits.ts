/**
 * Shape of `public/data/credits.json` — third-party asset and data attribution.
 */
export interface CreditItem {
  /** Project filename when the credit maps to a single file in `public/`. */
  asset?: string
  /** Short display title. */
  title: string
  /** Creator, studio, or agency. */
  author: string
  /** Primary link (model page, license, or documentation). Empty string if unknown. */
  url?: string
  /** License shorthand, e.g. CC BY 4.0. */
  license?: string
  /** Extra context or instructions to fix attribution. */
  notes?: string
}

export interface CreditGroup {
  id: string
  label: string
  items: CreditItem[]
}

export interface CreditsRoot {
  version: number
  intro?: string
  groups: CreditGroup[]
}
