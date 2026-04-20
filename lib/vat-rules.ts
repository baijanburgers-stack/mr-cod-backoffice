/**
 * VAT Rules Engine
 *
 * Provides verified, up-to-date HORECA VAT category seed data per country.
 * Each country returns a list of VatCategory objects that are written to the
 * Firestore sub-collection: stores/{storeId}/vatCategories/{id}
 *
 * Sources (verified April 2026):
 *  - Belgium: SPF Finances / FPS Finance — food dine-in 12%, food takeaway 6%,
 *    ALL beverages (alcoholic & non-alcoholic) 21%, per Royal Decree March 2026
 *    (proposed soft-drink reduction to 12% was WITHDRAWN).
 *  - Netherlands: Belastingdienst — food & non-alcoholic drinks 9% (dine-in AND
 *    takeaway, no distinction), alcoholic drinks 21%.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceType = 'dine-in' | 'takeaway' | 'delivery' | 'all';

/**
 * A single VAT category stored in Firestore.
 * One category represents one fiscal rate bucket that can be assigned to
 * menu items (separately for dine-in and takeaway contexts).
 */
export type VatCategory = {
  /** Stable ID used as the Firestore document ID. */
  id: string;
  /**
   * GKS / fiscal letter code (Belgium: A/B/C/D mandated by SPF).
   * For other countries use a descriptive shorthand (e.g. "H", "L", "V").
   */
  code: string;
  /** Human-readable label shown in the UI and on receipts. */
  label: string;
  /** VAT percentage, e.g. 21, 12, 6, 9, 0. */
  rate: number;
  /**
   * Which service contexts this category can logically apply to.
   * Used to filter the dropdown in the menu item editor.
   */
  serviceTypes: ServiceType[];
  /** Tailwind-compatible color token for the UI badge. */
  color: string;
  /**
   * When true this category is pre-selected for new menu items.
   * Only one category per country should be set as default.
   */
  isDefault: boolean;
};

// ─── Belgium seed data (verified April 2026) ─────────────────────────────────

const BE_CATEGORIES: VatCategory[] = [
  {
    id: 'be-a-beverages-21',
    code: 'A',
    label: 'All Beverages (Alcoholic & Non-Alcoholic)',
    rate: 21,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'red',
    isDefault: false,
  },
  {
    id: 'be-b-food-dine-in-12',
    code: 'B',
    label: 'Food — Dine-In / Restaurant Service',
    rate: 12,
    serviceTypes: ['dine-in'],
    color: 'orange',
    isDefault: false,
  },
  {
    id: 'be-c-food-takeaway-6',
    code: 'C',
    label: 'Food — Takeaway & Delivery',
    rate: 6,
    serviceTypes: ['takeaway', 'delivery'],
    color: 'amber',
    isDefault: true,
  },
  {
    id: 'be-d-exempt-0',
    code: 'D',
    label: 'Exempt / Zero-Rated',
    rate: 0,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'emerald',
    isDefault: false,
  },
];

// ─── Netherlands seed data (verified April 2026) ──────────────────────────────

const NL_CATEGORIES: VatCategory[] = [
  {
    id: 'nl-h-alcohol-21',
    code: 'H',
    label: 'Alcoholische Dranken (Alcohol >0.5%)',
    rate: 21,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'red',
    isDefault: false,
  },
  {
    id: 'nl-l-food-nonalcohol-9',
    code: 'L',
    label: 'Eten & Niet-Alcoholische Dranken',
    rate: 9,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'amber',
    isDefault: true,
  },
  {
    id: 'nl-v-exempt-0',
    code: 'V',
    label: 'Vrijgesteld / Nul-tarief',
    rate: 0,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'emerald',
    isDefault: false,
  },
];

// ─── Default fallback ─────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: VatCategory[] = [
  {
    id: 'default-standard-0',
    code: 'S',
    label: 'Standard Rate',
    rate: 0,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'slate',
    isDefault: true,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

const COUNTRY_SEED_MAP: Record<string, VatCategory[]> = {
  BE: BE_CATEGORIES,
  NL: NL_CATEGORIES,
};

/**
 * Returns the official seed VAT categories for a given country code.
 * Falls back to DEFAULT_CATEGORIES if the country has no registered rules.
 */
export function getDefaultVatCategories(countryCode: string): VatCategory[] {
  return COUNTRY_SEED_MAP[countryCode] ?? DEFAULT_CATEGORIES;
}

/**
 * Returns the country codes that have registered seed rules.
 */
export function getSupportedCountries(): string[] {
  return Object.keys(COUNTRY_SEED_MAP);
}

/**
 * Returns a human-readable country label for display.
 */
export function getCountryLabel(countryCode: string): string {
  const labels: Record<string, string> = {
    BE: '🇧🇪 Belgium',
    NL: '🇳🇱 Netherlands',
  };
  return labels[countryCode] ?? countryCode;
}
