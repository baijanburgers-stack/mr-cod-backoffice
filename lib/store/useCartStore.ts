import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Modifier metadata stored in cart so VAT breakdown can attribute each modifier
// to its own VAT bucket (e.g. an alcohol modifier at 21% vs the base food item at 6%).
export interface CartItemModifier {
  name: string;
  price: number;
  itemType?: 'food' | 'soft_drink' | 'alcohol';
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  storeId: string;
  itemType?: 'food' | 'soft_drink' | 'alcohol';
  vatRate?: number; // legacy fallback
  isComboElement?: boolean;
  comboParentId?: string;
  comboParentName?: string;
  originalComboBasePrice?: number;
  comboDiscountAmount?: number;
  // Structured modifier metadata for per-modifier VAT attribution
  modifiers?: CartItemModifier[];
}

export interface CartDiscount {
  type: 'percentage' | 'fixed';
  value: number;
}

interface VatBreakdown {
  [rate: number]: {
    net: number;
    vatAmount: number;
    gross: number;
    discountAbsorbed: number;
  };
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getVatBreakdown: (orderType?: 'delivery' | 'pickup' | 'dineIn', vatSettings?: any) => VatBreakdown;
  discount: CartDiscount | null;
  applyDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  removeDiscount: () => void;
  getDiscountAmount: () => number;
  getSubtotal: () => number;
}

// ─── Shared rate resolver — mirrors VatCalculationService.resolveVatRate ──────
function resolveVatRate(
  isDineIn: boolean,
  itemType: string,
  vatSettings: any,
  legacyVatRate?: number
): number {
  const type = itemType || 'food';

  if (vatSettings) {
    if (isDineIn) {
      if (type === 'food')       return vatSettings.foodDineInRate      ?? 12;
      if (type === 'soft_drink') return vatSettings.softDrinkDineInRate ?? 21;
      if (type === 'alcohol')    return vatSettings.alcoholDineInRate   ?? 21;
      return vatSettings.foodDineInRate ?? 12;
    } else {
      if (type === 'food')       return vatSettings.foodTakeawayRate      ?? 6;
      if (type === 'soft_drink') return vatSettings.softDrinkTakeawayRate ?? 6;
      if (type === 'alcohol')    return vatSettings.alcoholTakeawayRate   ?? 21;
      return vatSettings.foodTakeawayRate ?? 6;
    }
  } else {
    // Secure fallbacks — no vatSettings loaded yet (e.g. cart page)
    if (isDineIn) {
      if (type === 'food')       return 12;
      if (type === 'soft_drink') return 21;
      if (type === 'alcohol')    return 21;
      return 12;
    } else {
      if (type === 'food')       return 6;
      if (type === 'soft_drink') return 6;
      if (type === 'alcohol')    return 21;
      // Respect explicit legacy vatRate on food items when no settings available
      if (legacyVatRate !== undefined) return legacyVatRate;
      return 6;
    }
  }
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (newItem) => set((state) => {
        // If adding an item from a different store, completely clear the cart first
        const hasDifferentStore = state.items.length > 0 && state.items[0].storeId !== newItem.storeId;
        const currentItems = hasDifferentStore ? [] : state.items;

        const existingItem = currentItems.find((item) => item.id === newItem.id);
        if (existingItem) {
          return {
            items: currentItems.map((item) =>
              item.id === newItem.id
                ? { ...item, quantity: item.quantity + 1 }
                : item
            ),
            ...(hasDifferentStore ? { discount: null } : {})
          };
        }
        
        return { 
          items: [...currentItems, { ...newItem, quantity: 1 }],
          ...(hasDifferentStore ? { discount: null } : {}) 
        };
      }),
      removeItem: (id) => set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      })),
      updateQuantity: (id, quantity) => set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, quantity) } : item
        ).filter(item => item.quantity > 0),
      })),
      clearCart: () => set({ items: [], discount: null }),
      discount: null,
      applyDiscount: (type, value) => set({ discount: { type, value } }),
      removeDiscount: () => set({ discount: null }),
      getSubtotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
      },
      getDiscountAmount: () => {
        const subtotal = get().getSubtotal();
        const { discount } = get();
        if (!discount) return 0;
        if (discount.type === 'percentage') {
          return subtotal * (Math.min(discount.value, 100) / 100);
        }
        return Math.min(discount.value, subtotal);
      },
      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        return Math.max(0, subtotal - discountAmount);
      },
      getVatBreakdown: (orderType = 'pickup', vatSettings = null) => {
        const subtotal = get().getSubtotal();
        const discountAmount = get().getDiscountAmount();
        const breakdown: VatBreakdown = {};
        const isDineIn = orderType === 'dineIn';

        // Helper: add an amount into a VAT bucket
        const addToBucket = (rate: number, gross: number, discountShare: number) => {
          const adjustedGross = Math.max(0, gross - discountShare);
          const net = adjustedGross / (1 + rate / 100);
          const vatAmount = adjustedGross - net;
          if (!breakdown[rate]) {
            breakdown[rate] = { net: 0, vatAmount: 0, gross: 0, discountAbsorbed: 0 };
          }
          breakdown[rate].net += net;
          breakdown[rate].vatAmount += vatAmount;
          breakdown[rate].gross += adjustedGross;
          breakdown[rate].discountAbsorbed += discountShare;
        };

        get().items.forEach(item => {
          // ── 1. Compute the item's OWN price (excluding modifier prices stored separately) ──
          const modifierTotal = (item.modifiers || []).reduce((sum, m) => sum + m.price, 0);
          const itemBaseGross = (item.price - modifierTotal) * item.quantity;
          const modifiersGross = modifierTotal * item.quantity;
          const originalGross = item.price * item.quantity; // full line gross incl modifiers

          // ── 2. Proportional global discount share for this cart line ──
          let lineDiscountShare = 0;
          if (subtotal > 0 && discountAmount > 0) {
            lineDiscountShare = (originalGross / subtotal) * discountAmount;
          }

          // For proportional split of the line discount across base vs modifiers
          const baseRatio = originalGross > 0 ? itemBaseGross / originalGross : 1;
          const baseDiscountShare = lineDiscountShare * baseRatio;
          const modifiersDiscountShare = lineDiscountShare * (1 - baseRatio);

          // ── 3. Baked-in combo discount is already in item.price; track it for display ──
          const comboDiscountAbsorbed = (item.comboDiscountAmount || 0) * item.quantity;

          // ── 4. Base item bucket ──
          const itemRate = resolveVatRate(isDineIn, item.itemType || 'food', vatSettings, item.vatRate);
          const totalBaseDiscountAbsorbed = baseDiscountShare + comboDiscountAbsorbed;
          addToBucket(itemRate, itemBaseGross, totalBaseDiscountAbsorbed);
          if (comboDiscountAbsorbed > 0) {
            // Credit the comboDiscount to the discountAbsorbed field directly
            breakdown[itemRate].discountAbsorbed += comboDiscountAbsorbed;
          }

          // ── 5. Per-modifier buckets — each modifier at its own itemType rate ──
          if (item.modifiers && item.modifiers.length > 0) {
            const modifiersTotalForRatio = modifiersGross;
            item.modifiers.forEach(mod => {
              const modGross = mod.price * item.quantity;
              const modRatio = modifiersTotalForRatio > 0 ? modGross / modifiersTotalForRatio : 0;
              const modDiscountShare = modifiersDiscountShare * modRatio;
              const modRate = resolveVatRate(isDineIn, mod.itemType || 'food', vatSettings);
              addToBucket(modRate, modGross, modDiscountShare);
            });
          }
        });
        
        return breakdown;
      },
    }),
    {
      name: 'mrcod-cart',
    }
  )
);
