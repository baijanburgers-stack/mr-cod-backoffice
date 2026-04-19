export type VatSettings = {
  vatNumber: string;
  foodTakeawayRate: number;
  foodDineInRate: number;
  softDrinkTakeawayRate: number;
  softDrinkDineInRate: number;
  alcoholTakeawayRate: number;
  alcoholDineInRate: number;
  deliveryVatRate: number;
};

export const GLOBAL_VAT_RULES: Record<string, Partial<VatSettings>> = {
  BE: { // Belgium
    foodTakeawayRate: 6,
    foodDineInRate: 12,
    softDrinkTakeawayRate: 6,
    softDrinkDineInRate: 21,
    alcoholTakeawayRate: 21,
    alcoholDineInRate: 21,
    deliveryVatRate: 21,
  },
  NL: { // Netherlands
    foodTakeawayRate: 9,
    foodDineInRate: 9,
    softDrinkTakeawayRate: 9,
    softDrinkDineInRate: 9,
    alcoholTakeawayRate: 21,
    alcoholDineInRate: 21,
    deliveryVatRate: 21,
  },
  DEFAULT: {
    foodTakeawayRate: 0,
    foodDineInRate: 0,
    softDrinkTakeawayRate: 0,
    softDrinkDineInRate: 0,
    alcoholTakeawayRate: 0,
    alcoholDineInRate: 0,
    deliveryVatRate: 0,
  }
};

export function getVatRulesByCountry(countryCode: string): Partial<VatSettings> {
  return GLOBAL_VAT_RULES[countryCode] || GLOBAL_VAT_RULES['DEFAULT'];
}
