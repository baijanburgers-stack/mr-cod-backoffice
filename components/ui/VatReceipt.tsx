import React from 'react';
import { computeComboPricing, type ComboComponent } from '@/lib/combo-pricing';

interface VatReceiptProps {
  order: any;
  store: any;
}

// ─── VAT Table Builder ────────────────────────────────────────────────────────

interface ComboGroup {
  id: string;
  name: string;
  comboPrice: number;
  components: any[];
  pricingResult: ReturnType<typeof computeComboPricing> | null;
}

function buildComboGroups(orderItems: any[]): ComboGroup[] {
  const comboMap: Record<string, ComboGroup> = {};
  (orderItems || []).forEach((item: any) => {
    if (item.isComboElement && item.comboParentId) {
      if (!comboMap[item.comboParentId]) {
        comboMap[item.comboParentId] = {
          id: item.comboParentId,
          name: item.comboParentName || 'Combo',
          comboPrice: item.comboPrice ?? 0,
          components: [],
          pricingResult: null,
        };
      }
      comboMap[item.comboParentId].components.push(item);
    }
  });

  Object.values(comboMap).forEach(group => {
    if (group.components.length === 0 || group.comboPrice <= 0) return;
    const comboComponents: ComboComponent[] = group.components.map((c: any) => ({
      name: c.name,
      individualPrice: c.originalComboBasePrice ?? c.price,
      quantity: c.quantity,
      vatRate: c.vatRate ?? 12,
      vatCode: c.vatCode ?? 'B',
    }));
    group.pricingResult = computeComboPricing(comboComponents, group.comboPrice);
  });

  return Object.values(comboMap);
}

function buildVatTable(
  items: any[],
  globalDiscount: number,
  comboGroups: ComboGroup[],
) {
  const rates: Record<string, { net: number; vatAmount: number; tvac: number }> = {};

  const totalGross = items.reduce(
    (s: number, it: any) => s + (it.originalComboBasePrice ?? it.price) * it.quantity, 0,
  );

  // Lookup: discounted price per combo component
  const discountedPrices: Record<string, number> = {};
  comboGroups.forEach(g => {
    g.pricingResult?.componentDiscounts.forEach(cd => {
      discountedPrices[`${g.id}:${cd.name}`] = cd.discountedPrice;
    });
  });

  items.forEach((item: any) => {
    const rate: number = item.vatRate ?? 12;
    const key = String(rate);
    if (!rates[key]) rates[key] = { net: 0, vatAmount: 0, tvac: 0 };

    let grossForVat: number;
    if (item.isComboElement && item.comboParentId) {
      const dp = discountedPrices[`${item.comboParentId}:${item.name}`] ?? item.price;
      grossForVat = dp * item.quantity;
    } else {
      const orig = item.price * item.quantity;
      const slice = totalGross > 0 ? (orig / totalGross) * globalDiscount : 0;
      grossForVat = Math.max(0, orig - slice);
    }

    const net = grossForVat / (1 + rate / 100);
    rates[key].net += net;
    rates[key].vatAmount += grossForVat - net;
    rates[key].tvac += grossForVat;
  });

  Object.values(rates).forEach(r => {
    r.net = Math.round(r.net * 100) / 100;
    r.vatAmount = Math.round(r.vatAmount * 100) / 100;
    r.tvac = Math.round(r.tvac * 100) / 100;
  });

  return rates;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VatReceipt({ order, store }: VatReceiptProps) {
  if (!order || !store) return null;

  const dateStr = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleString()
    : (order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString());

  const vatNumber = store.vatSettings?.vatNumber || store.vatNumber || 'BEXXXXXXXXXX';
  const phone = store.phone || store.contactNumber || '';

  const comboGroups = buildComboGroups(order.items || []);
  const comboParentIds = new Set(comboGroups.map(g => g.id));

  const standaloneItems = (order.items || []).filter(
    (it: any) => !(it.isComboElement && it.comboParentId && comboParentIds.has(it.comboParentId)),
  );

  const totalComboSavings = comboGroups.reduce((s, g) => s + (g.pricingResult?.savings ?? 0), 0);
  const globalDiscount = Math.max(0, (order.discount ?? 0) - totalComboSavings);
  const vatTable = buildVatTable(order.items || [], globalDiscount, comboGroups);

  return (
    <div className="hidden print:block thermal-receipt text-xs leading-tight font-mono text-black bg-white p-4 mx-auto w-[80mm] absolute top-0 left-0">

      {/* Header */}
      <div className="text-center mb-4 flex flex-col items-center">
        {store.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo} alt="Store Logo" className="w-16 h-16 object-contain mb-2 grayscale" />
        )}
        <h1 className="text-lg font-bold uppercase">{store.name || 'EazyOrder'}</h1>
        <p className="whitespace-pre-line text-[10px] mt-1">{store.address}</p>
        {phone && <p className="text-[10px] mt-1">Tel: {phone}</p>}
        {vatNumber && <p className="text-[10px] mt-1 font-bold">TVA / BTW: {vatNumber}</p>}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* Order Meta */}
      <div className="mb-4 text-[11px]">
        <div className="flex justify-between"><span>Ticket:</span><span className="font-bold">{order.orderNumber}</span></div>
        <div className="flex justify-between"><span>Date:</span><span>{dateStr}</span></div>
        <div className="flex justify-between"><span>Type:</span><span>{order.type || 'Pickup'}</span></div>
        {order.customerName && <div className="flex justify-between"><span>Client:</span><span>{order.customerName}</span></div>}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* ── ITEMS SECTION ── */}
      <div className="mb-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-black border-dashed">
              <th className="py-1 font-normal w-8">Qty</th>
              <th className="py-1 font-normal">Item</th>
              <th className="py-1 font-normal text-right">Price</th>
            </tr>
          </thead>
          <tbody>

            {/* Combo groups — name+price on header, components below (no subtotal inside) */}
            {comboGroups.map((group, gi) => (
              <React.Fragment key={`combo-${gi}`}>
                {/* Combo header: name + combo price */}
                <tr className="align-top font-bold border-t border-dashed border-gray-300">
                  <td className="py-1 align-top">1x</td>
                  <td className="py-1 pr-2 uppercase tracking-wide">{group.name}</td>
                  <td className="py-1 text-right">€{group.comboPrice.toFixed(2)}</td>
                </tr>

                {/* Component lines — individual prices in brackets, indented */}
                {group.components.map((c: any, ci: number) => {
                  const unitPrice = c.originalComboBasePrice ?? c.price;
                  const isLast = ci === group.components.length - 1;
                  return (
                    <tr key={`comp-${gi}-${ci}`} className="align-top text-[10px]">
                      <td className="pl-1 py-0.5 text-gray-500">{isLast ? '└' : '├'}</td>
                      <td className="py-0.5 pr-2 text-gray-600">{c.name}</td>
                      <td className="py-0.5 text-right text-gray-500">
                        ({(unitPrice * c.quantity).toFixed(2)})
                      </td>
                    </tr>
                  );
                })}

                <tr><td colSpan={3} className="pb-1" /></tr>
              </React.Fragment>
            ))}

            {/* Standalone items — full price, no discount */}
            {standaloneItems.map((item: any, i: number) => (
              <tr key={`item-${i}`} className="align-top border-t border-dashed border-gray-200">
                <td className="py-1">{item.quantity}x</td>
                <td className="py-1 pr-2">
                  {item.name}
                  {item.variants?.map((v: any, idx: number) => (
                    <div key={idx} className="text-[9px] pl-2 text-gray-600">- {v.name}</div>
                  ))}
                  {item.modifiers?.map((m: any, idx: number) => (
                    <div key={idx} className="text-[9px] pl-2 text-gray-600">+ {m.name}</div>
                  ))}
                </td>
                <td className="py-1 text-right">€{(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            ))}

          </tbody>
        </table>
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* ── SUBTOTAL SECTION ── */}
      <div className="mb-3 text-[11px]">
        <div className="flex justify-between mb-1">
          <span>Subtotal</span>
          <span>€{(order.subtotal ?? order.total)?.toFixed(2)}</span>
        </div>
      </div>

      {/* ── COMBO DISCOUNT SECTION (only shown when there are savings) ── */}
      {comboGroups.some(g => (g.pricingResult?.savings ?? 0) > 0) && (
        <>
          <div className="border-b border-black border-dashed my-2" />
          <div className="mb-3 text-[11px]">
            <p className="font-black uppercase tracking-widest text-[9px] mb-1.5">Combo Discount</p>

            {comboGroups.map((group, gi) => {
              const pricing = group.pricingResult;
              if (!pricing || pricing.savings <= 0) return null;
              const multiCat = pricing.perCategoryDiscount.length > 1;

              return (
                <div key={`disc-${gi}`} className="mb-1.5">
                  {comboGroups.length > 1 && (
                    <div className="text-[10px] text-gray-500 italic mb-0.5">{group.name}</div>
                  )}
                  {multiCat ? (
                    pricing.perCategoryDiscount.map(cat => (
                      <div key={cat.vatCode} className="flex justify-between">
                        <span>Cat {cat.vatCode} — {cat.vatRate}%</span>
                        <span className="font-bold">-€{cat.discountAmount.toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between">
                      <span>{group.name} saving</span>
                      <span className="font-bold">-€{pricing.savings.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {totalComboSavings > 0 && comboGroups.length > 1 && (
              <div className="flex justify-between border-t border-dashed border-gray-400 pt-1 font-bold">
                <span>Total saving</span>
                <span>-€{totalComboSavings.toFixed(2)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Global promo discount */}
      {globalDiscount > 0 && (
        <>
          <div className="border-b border-black border-dashed my-2" />
          <div className="mb-3 text-[11px]">
            <div className="flex justify-between font-bold">
              <span>Promo discount</span>
              <span>-€{globalDiscount.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}

      {/* Total */}
      <div className="border-b border-black border-dashed my-2" />
      <div className="mb-4 text-[11px]">
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL (TVAC)</span>
          <span>€{order.total?.toFixed(2)}</span>
        </div>
      </div>

      {/* ── VAT BREAKDOWN (after all discounts) ── */}
      {Object.keys(vatTable).length > 0 && (
        <>
          <div className="border-b border-black border-dashed my-2" />
          <div className="mb-4 text-[10px]">
            <p className="font-bold mb-1 uppercase tracking-widest text-[9px]">VAT / TVA (after discount)</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-400">
                  <th className="font-normal pb-1">%</th>
                  <th className="font-normal pb-1 text-right">HTVA</th>
                  <th className="font-normal pb-1 text-right">TVA</th>
                  <th className="font-normal pb-1 text-right">TVAC</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(vatTable)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([rate, data]) => (
                    <tr key={rate}>
                      <td className="py-0.5">{rate}%</td>
                      <td className="py-0.5 text-right">€{data.net.toFixed(2)}</td>
                      <td className="py-0.5 text-right">€{data.vatAmount.toFixed(2)}</td>
                      <td className="py-0.5 text-right">€{data.tvac.toFixed(2)}</td>
                    </tr>
                  ))}
                <tr className="border-t border-black border-dashed font-bold">
                  <td className="py-0.5">Total</td>
                  <td className="py-0.5 text-right">
                    €{Object.values(vatTable).reduce((s, d) => s + d.net, 0).toFixed(2)}
                  </td>
                  <td className="py-0.5 text-right">
                    €{Object.values(vatTable).reduce((s, d) => s + d.vatAmount, 0).toFixed(2)}
                  </td>
                  <td className="py-0.5 text-right">€{order.total?.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="border-b border-black my-2" />

      {/* Footer */}
      <div className="text-center mt-6 mb-8 text-[11px] font-bold pb-10">
        <p>Thank you! | Dank u! | Merci!</p>
      </div>

    </div>
  );
}
