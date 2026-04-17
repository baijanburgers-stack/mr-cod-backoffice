import React from 'react';

interface VatReceiptProps {
  order: any;
  store: any;
}

/**
 * Builds a per-VAT-rate breakdown from order items + optional global discount.
 * For combo elements their `originalComboBasePrice` is the gross before the
 * proportional combo discount, and `comboDiscountAmount` is the discount slice.
 */
function buildVatTable(items: any[], globalDiscount: number) {
  // Accumulate by rate
  const rates: Record<string, {
    grossBeforeAnyDiscount: number;
    comboDiscountAbsorbed: number;
    globalDiscountAbsorbed: number;
    net: number;
    vatAmount: number;
    gross: number; // after all discounts
  }> = {};

  // First pass: sum gross-before-discount per rate
  const totalGross = items.reduce((s: number, it: any) => {
    const g = (it.originalComboBasePrice ?? it.price) * it.quantity;
    return s + g;
  }, 0);

  items.forEach((item: any) => {
    const rate: number = item.vatRate ?? 6; // fallback
    const key = String(rate);
    if (!rates[key]) rates[key] = { grossBeforeAnyDiscount: 0, comboDiscountAbsorbed: 0, globalDiscountAbsorbed: 0, net: 0, vatAmount: 0, gross: 0 };

    const originalGross = (item.originalComboBasePrice ?? item.price) * item.quantity;
    const comboDisc = (item.comboDiscountAmount ?? 0) * item.quantity;

    rates[key].grossBeforeAnyDiscount += originalGross;
    rates[key].comboDiscountAbsorbed += comboDisc;

    // Proportional global discount slice
    const globalSlice = totalGross > 0 ? (originalGross / totalGross) * globalDiscount : 0;
    rates[key].globalDiscountAbsorbed += globalSlice;

    const adjustedGross = Math.max(0, originalGross - comboDisc - globalSlice);
    const net = adjustedGross / (1 + rate / 100);
    const vatAmount = adjustedGross - net;

    rates[key].gross += adjustedGross;
    rates[key].net += net;
    rates[key].vatAmount += vatAmount;
  });

  return rates;
}

export function VatReceipt({ order, store }: VatReceiptProps) {
  if (!order || !store) return null;

  const dateStr = order.createdAt?.toDate
    ? order.createdAt.toDate().toLocaleString()
    : (order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString());

  const vatNumber = store.vatSettings?.vatNumber || store.vatNumber || 'BEXXXXXXXXXX';
  const phone = store.phone || store.contactNumber || '';

  // ── Group items into combos and standalone ────────────────────────────
  const receiptGroups: any[] = [];
  const comboMap: Record<string, any> = {};

  (order.items || []).forEach((item: any) => {
    if (item.isComboElement && item.comboParentId) {
      if (!comboMap[item.comboParentId]) {
        const g = {
          isCombo: true,
          id: item.comboParentId,
          name: item.comboParentName || 'Combo',
          components: [] as any[],
        };
        comboMap[item.comboParentId] = g;
        receiptGroups.push(g);
      }
      comboMap[item.comboParentId].components.push(item);
    } else {
      receiptGroups.push({ isCombo: false, ...item });
    }
  });

  // ── Build global VAT table (recomputed from items + global discount) ──
  const globalDiscount: number = Math.max(0, (order.discount ?? 0) -
    (order.items || []).reduce((s: number, it: any) =>
      s + (it.comboDiscountAmount ?? 0) * it.quantity, 0));

  const vatTable = buildVatTable(order.items || [], globalDiscount);

  // total combo discount across ALL combos
  const totalComboDiscount = (order.items || []).reduce(
    (s: number, it: any) => s + (it.comboDiscountAmount ?? 0) * it.quantity, 0
  );

  return (
    <div className="hidden print:block thermal-receipt text-xs leading-tight font-mono text-black bg-white p-4 mx-auto w-[80mm] absolute top-0 left-0">

      {/* Header */}
      <div className="text-center mb-4 flex flex-col items-center">
        {store.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo} alt="Store Logo" className="w-16 h-16 object-contain mb-2 grayscale" />
        )}
        <h1 className="text-lg font-bold uppercase">{store.name || 'MR COD'}</h1>
        <p className="whitespace-pre-line text-[10px] mt-1">{store.address}</p>
        {phone && <p className="text-[10px] mt-1">Tel: {phone}</p>}
        {vatNumber && <p className="text-[10px] mt-1 font-bold">TVA / BTW: {vatNumber}</p>}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* Meta */}
      <div className="mb-4 text-[11px]">
        <div className="flex justify-between"><span>Ticket:</span><span className="font-bold">{order.orderNumber}</span></div>
        <div className="flex justify-between"><span>Date:</span><span>{dateStr}</span></div>
        <div className="flex justify-between"><span>Type:</span><span>{order.type || 'Pickup'}</span></div>
        {order.customerName && <div className="flex justify-between"><span>Client:</span><span>{order.customerName}</span></div>}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* Items */}
      <div className="mb-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-black border-dashed">
              <th className="py-1 font-normal w-8">Qty</th>
              <th className="py-1 font-normal">Item</th>
              <th className="py-1 font-normal text-right">TVAC</th>
            </tr>
          </thead>
          <tbody>
            {receiptGroups.map((group: any, i: number) => {
              if (group.isCombo) {
                // Sum original (pre-discount) prices of all components
                const originalTotal = group.components.reduce(
                  (s: number, c: any) => s + (c.originalComboBasePrice ?? c.price) * c.quantity, 0
                );
                // Selling price = sum of discounted prices
                const sellingPrice = group.components.reduce(
                  (s: number, c: any) => s + c.price * c.quantity, 0
                );
                const comboDiscount = Math.max(0, originalTotal - sellingPrice);

                return (
                  <React.Fragment key={`combo-${i}`}>
                    {/* Combo header row */}
                    <tr className="align-top font-bold border-t border-dashed border-gray-300">
                      <td className="py-1">1x</td>
                      <td className="py-1 pr-2 uppercase tracking-wide">{group.name}</td>
                      <td className="py-1 text-right">€{sellingPrice.toFixed(2)}</td>
                    </tr>

                    {/* Component rows — original price */}
                    {group.components.map((c: any, ci: number) => (
                      <tr key={`comp-${i}-${ci}`} className="align-top text-[10px]">
                        <td className="pl-1 py-0.5 text-gray-600">{c.quantity}x</td>
                        <td className="pl-2 py-0.5 pr-2 text-gray-700">{c.name}</td>
                        <td className="py-0.5 text-right text-gray-600">
                          €{((c.originalComboBasePrice ?? c.price) * c.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}

                    {/* Component subtotal */}
                    <tr className="text-[10px] border-t border-dashed border-gray-300">
                      <td />
                      <td className="py-0.5 pr-2 text-gray-500 italic">Subtotal components</td>
                      <td className="py-0.5 text-right text-gray-500">€{originalTotal.toFixed(2)}</td>
                    </tr>

                    {/* Combo discount */}
                    {comboDiscount > 0 && (
                      <tr className="text-[10px] font-bold">
                        <td />
                        <td className="py-0.5 pr-2">Combo Discount</td>
                        <td className="py-0.5 text-right">-€{comboDiscount.toFixed(2)}</td>
                      </tr>
                    )}

                    {/* Spacer */}
                    <tr><td colSpan={3} className="pb-1" /></tr>
                  </React.Fragment>
                );
              }

              // Standard item
              return (
                <tr key={`item-${i}`} className="align-top">
                  <td className="py-1">{group.quantity}x</td>
                  <td className="py-1 pr-2">
                    {group.name}
                    {group.variants?.map((v: any, idx: number) => (
                      <div key={idx} className="text-[9px] pl-2 text-gray-600">- {v.name}</div>
                    ))}
                    {group.modifiers?.map((m: any, idx: number) => (
                      <div key={idx} className="text-[9px] pl-2 text-gray-600">+ {m.name}</div>
                    ))}
                  </td>
                  <td className="py-1 text-right">€{(group.price * group.quantity).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* Totals */}
      <div className="mb-4 text-[11px]">
        {/* Subtotal before any discount */}
        <div className="flex justify-between mb-1">
          <span>Subtotal</span>
          <span>€{(order.subtotal ?? order.total)?.toFixed(2)}</span>
        </div>

        {/* Combo discount summary */}
        {totalComboDiscount > 0 && (
          <div className="flex justify-between mb-1 font-bold">
            <span>Combo Discount</span>
            <span>-€{totalComboDiscount.toFixed(2)}</span>
          </div>
        )}

        {/* Global promo discount */}
        {globalDiscount > 0 && (
          <div className="flex justify-between mb-1 font-bold">
            <span>Promo Discount</span>
            <span>-€{globalDiscount.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between text-sm font-bold pt-2 border-t border-black border-dashed">
          <span>Total (TVAC)</span>
          <span>€{order.total?.toFixed(2)}</span>
        </div>
      </div>

      {/* VAT breakdown table */}
      {Object.keys(vatTable).length > 0 && (
        <>
          <div className="border-b border-black border-dashed my-2" />
          <div className="mb-4 text-[10px]">
            <p className="font-bold mb-1 uppercase tracking-widest text-[9px]">VAT / TVA Summary (after discount)</p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-400">
                  <th className="font-normal pb-1">TVA %</th>
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
                      <td className="py-0.5 text-right">€{data.gross.toFixed(2)}</td>
                    </tr>
                  ))}

                {/* Totals row */}
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

            {/* Per-rate discount breakdown (only when combo has multiple VAT rates) */}
            {(() => {
              const ratesWithDiscount = Object.entries(vatTable).filter(
                ([, d]) => d.comboDiscountAbsorbed + d.globalDiscountAbsorbed > 0.005
              );
              if (ratesWithDiscount.length < 2) return null;
              return (
                <div className="mt-2 border-t border-dashed border-gray-400 pt-1">
                  <p className="text-[9px] uppercase tracking-widest mb-0.5">Discount split per VAT rate</p>
                  {ratesWithDiscount.map(([rate, d]) => (
                    <div key={rate} className="flex justify-between">
                      <span>{rate}%</span>
                      <span>-€{(d.comboDiscountAbsorbed + d.globalDiscountAbsorbed).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
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
