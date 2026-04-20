/**
 * VAT Rules Engine
 *
 * Provides verified, up-to-date HORECA VAT category seed data per country.
 * Each country returns a list of VatCategory objects that are written to the
 * Firestore sub-collection: stores/{storeId}/vatCategories/{id}
 *
 * Sources (verified April 2026):
 *  - Belgium: SPF Finances — EFFECTIVE 01/03/2026 (March 1, 2026).
 *    Harmonised HORECA rates (sources: vatupdate.com, twobirds.com, EY, PwC):
 *      A (21%): Alcoholic beverages (beer >0.5% ABV, spirits >1.2% ABV).
 *      B (12%): All food & non-alcoholic drinks — dine-in AND takeaway/delivery.
 *               Non-alcoholic drinks DECREASED from 21% → 12% in restaurants.
 *               Takeaway food INCREASED from 6% → 12% (prepared meals, shelf
 *               life ≤ 2 days, intended for immediate consumption).
 *      C  (6%): Basic / unprepared food products (not "prepared meals").
 *               This rate still applies to raw/packaged food sold as groceries.
 *      D  (0%): Exempt / zero-rated items.
 *    GKS codes A/B/C/D are mandated by SPF Finances for white cash registers.
 *  - Netherlands: Belastingdienst — food & non-alcoholic drinks 9% (dine-in AND
 *    takeaway, no distinction), alcoholic drinks 21%.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceType = 'dine-in' | 'takeaway' | 'delivery' | 'all';

/**
 * The nature of a menu item or modifier group.
 * Used to automatically resolve the correct VAT category at order time
 * without requiring the user to manually pick a VAT rate.
 */
export type ItemType =
  | 'food'           // Prepared meal (burger, fries, wrap…)            → B/12%
  | 'non-alcoholic'  // Soft drink, water, juice, coffee in HORECA       → B/12%
  | 'alcoholic'      // Beer >0.5%, wine, spirits >1.2%                  → A/21%
  | 'basic-food';    // Raw / unprepared / packaged food                  → C/6%

/**
 * A single VAT category stored in Firestore.
 * One category represents one fiscal rate bucket that can be assigned to
 * menu items. The `itemType` field links this category to the auto-resolver.
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
  /**
   * Links this VAT bucket to an ItemType for automatic resolution.
   * resolveVatCategory() uses this field to find the right bucket
   * given an item's nature and the order's service type.
   */
  itemType?: ItemType;
};

// ─── Belgium seed data (effective 01/03/2026) ────────────────────────────────
// GKS fiscal codes are mandated by SPF Finances: A=21%, B=12%, C=6%, D=0%.
// Since dine-in and takeaway are now the SAME rate for food & non-alcoholic
// drinks (both 12%), they share a single GKS-B category.

const BE_CATEGORIES: VatCategory[] = [
  {
    id: 'be-a-alcohol-21',
    code: 'A',
    label: 'Alcoholic Beverages (beer >0.5%, spirits >1.2%)',
    rate: 21,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'red',
    isDefault: false,
    itemType: 'alcoholic',
  },
  {
    id: 'be-b-food-drinks-12',
    code: 'B',
    label: 'Food & Non-Alcoholic Drinks (Dine-In & Takeaway)',
    rate: 12,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'orange',
    isDefault: true,
    itemType: 'food',
  },
  {
    id: 'be-c-basic-food-6',
    code: 'C',
    label: 'Basic / Unprepared Food Products (not prepared meals)',
    rate: 6,
    serviceTypes: ['takeaway', 'delivery'],
    color: 'amber',
    isDefault: false,
    itemType: 'basic-food',
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
    itemType: 'alcoholic',
  },
  {
    id: 'nl-l-food-nonalcohol-9',
    code: 'L',
    label: 'Eten & Niet-Alcoholische Dranken',
    rate: 9,
    serviceTypes: ['dine-in', 'takeaway', 'delivery'],
    color: 'amber',
    isDefault: true,
    itemType: 'food',
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
    itemType: 'food',
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

/**
 * Automatically resolves the correct VAT category for an item given:
 * - the store's configured VAT categories (from Firestore)
 * - the item's nature (food / non-alcoholic / alcoholic / basic-food)
 * - the order's service type (dine-in / takeaway / delivery)
 *
 * Resolution priority:
 * 1. Exact match on itemType + serviceType
 * 2. Match on itemType that covers 'all' service types
 * 3. The store's default category (isDefault: true)
 * 4. undefined — caller should fall back to a hardcoded rate
 *
 * NOTE: 'non-alcoholic' items resolve to the same bucket as 'food'
 * (both B/12% in Belgium), so this function merges them during lookup.
 */
export function resolveVatCategory(
  categories: VatCategory[],
  itemType: ItemType,
  serviceType: ServiceType,
): VatCategory | undefined {
  // non-alcoholic drinks share the same VAT bucket as food in BE/NL
  const effectiveType: ItemType =
    itemType === 'non-alcoholic' ? 'food' : itemType;

  // 1. Exact match: itemType + serviceType
  const exact = categories.find(
    (c) =>
      c.itemType === effectiveType &&
      (c.serviceTypes as string[]).includes(serviceType),
  );
  if (exact) return exact;

  // 2. Match on itemType that explicitly covers 'all'
  const allServices = categories.find(
    (c) =>
      c.itemType === effectiveType &&
      (c.serviceTypes as string[]).includes('all'),
  );
  if (allServices) return allServices;

  // 3. Fall back to store default
  return categories.find((c) => c.isDefault);
}

/**
 * UI metadata for each ItemType — labels, emoji and description for forms.
 */
export const ITEM_TYPE_LABELS: Record<
  ItemType,
  { label: string; emoji: string; description: string }
> = {
  'food':          { label: 'Food',                emoji: '🍔', description: 'Prepared meals — burgers, wraps, fries…' },
  'non-alcoholic': { label: 'Non-Alcoholic Drink', emoji: '🥤', description: 'Soft drinks, juices, water, coffee…' },
  'alcoholic':     { label: 'Alcoholic Drink',     emoji: '🍺', description: 'Beer, wine, spirits…' },
  'basic-food':    { label: 'Basic Food Product',  emoji: '🛒', description: 'Raw / unprepared / packaged groceries' },
};

