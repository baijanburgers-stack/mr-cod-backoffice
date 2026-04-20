/**
 * Combo Pricing Engine
 *
 * Computes automatic savings for a combo and splits the discount
 * proportionally across VAT categories for fiscal compliance.
 *
 * Key rules (Belgian HORECA, confirmed by user):
 * 1. Combo price is set by the manager (the known charge, e.g. €11.99).
 * 2. Individual item prices are read from the selected slot options.
 * 3. Savings = sum(individual prices) − combo price  →  computed automatically.
 * 4. Discount is distributed proportionally across components by price.
 * 5. VAT is calculated on the discounted (net) price, never on the original.
 * 6. Standalone items ordered alongside a combo get zero discount ("no bleeding").
 * 7. If a combo spans multiple VAT categories (e.g. food 12% + alcohol 21%),
 *    the discount breakdown is shown per-category on the receipt.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One component of a combo as selected by the customer.
 * vatRate is resolved via resolveVatCategory() before passing here.
 */
export interface ComboComponent {
  name: string;
  individualPrice: number; // the item's standalone price (e.g. €8.00)
  quantity: number;        // usually 1 per slot, but slots support qty > 1
  vatRate: number;         // e.g. 12 or 21 (resolved from itemType)
  vatCode: string;         // GKS code e.g. "A", "B"
}

/**
 * Result of computeComboPricing() — used by backoffice preview, kiosk, receipt.
 */
export interface ComboPricingResult {
  /** Sum of all individual component prices (before discount). */
  itemsTotal: number;
  /** The combo price (unchanged — set by manager). */
  comboPrice: number;
  /** Total savings = itemsTotal − comboPrice. */
  savings: number;
  /** Savings as a percentage of itemsTotal. 0 if no savings. */
  savingsPct: number;
  /**
   * Per-component discount amount (proportional slice of total savings).
   * Used by the receipt engine to show per-component discounted prices.
   */
  componentDiscounts: ComponentDiscount[];
  /**
   * Discount aggregated per VAT category.
   * Used by the receipt to show per-category discount when combo spans
   * multiple VAT rates (e.g. food 12% + alcohol 21%).
   */
  perCategoryDiscount: CategoryDiscount[];
}

export interface ComponentDiscount {
  name: string;
  individualPrice: number;
  discountAmount: number;       // proportional slice of total savings
  discountedPrice: number;      // individualPrice − discountAmount
  quantity: number;
  vatRate: number;
  vatCode: string;
}

export interface CategoryDiscount {
  vatRate: number;
  vatCode: string;
  /** Sum of original prices for components in this VAT category. */
  originalTotal: number;
  /** Proportional discount for this VAT category. */
  discountAmount: number;
  /** Net taxable base (after discount, before VAT). */
  netBase: number;
  /** VAT amount on the net base. */
  vatAmount: number;
  /** Total including VAT (TVAC). */
  tvac: number;
}

// ─── Core Engine ─────────────────────────────────────────────────────────────

/**
 * Computes automatic combo savings and splits the discount proportionally.
 *
 * @param components  The items the customer selected (one per slot, with prices).
 * @param comboPrice  The fixed combo price set by the manager.
 * @returns           Full pricing breakdown for receipt + kiosk badge.
 */
export function computeComboPricing(
  components: ComboComponent[],
  comboPrice: number,
): ComboPricingResult {
  // ── Step 1: sum all individual prices ────────────────────────────────────
  const itemsTotal = components.reduce(
    (sum, c) => sum + c.individualPrice * c.quantity,
    0,
  );

  const savings = Math.max(0, itemsTotal - comboPrice);
  const savingsPct = itemsTotal > 0 ? (savings / itemsTotal) * 100 : 0;

  // ── Step 2: proportional discount per component ───────────────────────────
  // Each component absorbs a slice of the total savings proportional to its
  // share of the original basket value. This is the fiscally correct method.
  const componentDiscounts: ComponentDiscount[] = components.map((c) => {
    const componentTotal = c.individualPrice * c.quantity;
    const share = itemsTotal > 0 ? componentTotal / itemsTotal : 0;
    const discountAmount = round2(savings * share);
    const discountedPrice = round2(c.individualPrice - discountAmount / c.quantity);
    return {
      name: c.name,
      individualPrice: c.individualPrice,
      discountAmount,
      discountedPrice: Math.max(0, discountedPrice),
      quantity: c.quantity,
      vatRate: c.vatRate,
      vatCode: c.vatCode,
    };
  });

  // Correct rounding drift: add any leftover cents to the largest component
  const allocatedDiscount = componentDiscounts.reduce((s, cd) => s + cd.discountAmount, 0);
  const drift = round2(savings - allocatedDiscount);
  if (drift !== 0 && componentDiscounts.length > 0) {
    const largest = componentDiscounts.reduce((a, b) =>
      b.individualPrice * b.quantity > a.individualPrice * a.quantity ? b : a,
    );
    largest.discountAmount = round2(largest.discountAmount + drift);
    largest.discountedPrice = round2(
      largest.individualPrice - largest.discountAmount / largest.quantity,
    );
  }

  // ── Step 3: aggregate per VAT category ───────────────────────────────────
  const catMap: Record<string, CategoryDiscount> = {};
  componentDiscounts.forEach((cd) => {
    const key = String(cd.vatRate);
    if (!catMap[key]) {
      catMap[key] = {
        vatRate: cd.vatRate,
        vatCode: cd.vatCode,
        originalTotal: 0,
        discountAmount: 0,
        netBase: 0,
        vatAmount: 0,
        tvac: 0,
      };
    }
    const cat = catMap[key];
    const origTotal = cd.individualPrice * cd.quantity;
    const discountedTotal = round2(origTotal - cd.discountAmount);

    cat.originalTotal = round2(cat.originalTotal + origTotal);
    cat.discountAmount = round2(cat.discountAmount + cd.discountAmount);

    // VAT on discounted price (Belgian rule: VAT after discount)
    const net = discountedTotal / (1 + cd.vatRate / 100);
    const vat = discountedTotal - net;

    cat.netBase = round2(cat.netBase + net);
    cat.vatAmount = round2(cat.vatAmount + vat);
    cat.tvac = round2(cat.tvac + discountedTotal);
  });

  const perCategoryDiscount = Object.values(catMap).sort(
    (a, b) => a.vatRate - b.vatRate,
  );

  return {
    itemsTotal: round2(itemsTotal),
    comboPrice: round2(comboPrice),
    savings: round2(savings),
    savingsPct,
    componentDiscounts,
    perCategoryDiscount,
  };
}

// ─── Backoffice preview helper ────────────────────────────────────────────────

/**
 * Computes savings preview for the backoffice combo editor.
 * Takes min and max possible basket values (cheapest/most expensive
 * combination of slot options) and returns a range.
 */
export function computeSavingsRange(
  minBasket: number,
  maxBasket: number,
  comboPrice: number,
): {
  minSavings: number;
  maxSavings: number;
  minSavingsPct: number;
  maxSavingsPct: number;
  isGoodDeal: boolean;   // savings > 10% of basket
  isPriceTooHigh: boolean; // combo >= basket (overcharge)
} {
  const minSavings = Math.max(0, round2(minBasket - comboPrice));
  const maxSavings = Math.max(0, round2(maxBasket - comboPrice));
  const minSavingsPct = minBasket > 0 ? (minSavings / minBasket) * 100 : 0;
  const maxSavingsPct = maxBasket > 0 ? (maxSavings / maxBasket) * 100 : 0;

  return {
    minSavings,
    maxSavings,
    minSavingsPct,
    maxSavingsPct,
    isGoodDeal: minSavingsPct >= 10,
    isPriceTooHigh: comboPrice >= minBasket,
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
