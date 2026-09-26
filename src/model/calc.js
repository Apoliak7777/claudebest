// EN 16931 invoice arithmetic on exact decimals.
// Recomputes line net amounts, document totals and the VAT breakdown from the
// lines and document-level allowances/charges of an invoice model.
import { Decimal, D, ZERO, dsum } from './decimal.js';

const r2 = (d) => d.round(2);
const s2 = (d) => d.toString(2);
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/** Categories where the VAT rate is always 0 and no tax is charged. */
export const ZERO_RATED = new Set(['Z', 'E', 'AE', 'K', 'G', 'O']);

/** Human names of UNCL5305 VAT categories (sk). */
export const VAT_CATEGORIES = {
  S: 'Štandardná sadzba',
  Z: 'Nulová sadzba',
  E: 'Oslobodené od dane',
  AE: 'Prenesenie daňovej povinnosti',
  K: 'Dodanie tovaru/služby v rámci EÚ',
  G: 'Vývoz mimo EÚ',
  O: 'Mimo predmetu DPH',
  L: 'Kanárske ostrovy (IGIC)',
  M: 'Ceuta a Melilla (IPSI)',
};

function allowanceAmount(ac, base) {
  if (has(ac.amount)) return r2(D(ac.amount));
  if (has(ac.percent)) {
    const b = has(ac.baseAmount) ? D(ac.baseAmount) : base;
    return r2(b.mul(D(ac.percent)).div(100, 10));
  }
  return ZERO;
}

/**
 * Compute a line's net amount (BT-131) and normalised allowances/charges.
 * price.amount is the NET item price (BT-146); when price.gross (BT-148) and
 * price.discount (BT-147) are given, net = gross - discount.
 */
export function calcLine(line) {
  const qty = has(line.quantity) ? D(line.quantity) : D(1);
  let price = has(line.price?.amount) ? D(line.price.amount) : ZERO;
  if (!has(line.price?.amount) && has(line.price?.gross)) price = D(line.price.gross).sub(has(line.price.discount) ? D(line.price.discount) : ZERO);
  const baseQty = has(line.price?.baseQuantity) && !D(line.price.baseQuantity).isZero() ? D(line.price.baseQuantity) : D(1);
  const gross = r2(qty.mul(price).div(baseQty, 10));
  const allowances = (line.allowances || []).map((a) => ({ ...a, charge: false, amount: s2(allowanceAmount(a, gross)), baseAmount: has(a.percent) ? s2(has(a.baseAmount) ? D(a.baseAmount) : gross) : a.baseAmount }));
  const charges = (line.charges || []).map((c) => ({ ...c, charge: true, amount: s2(allowanceAmount(c, gross)), baseAmount: has(c.percent) ? s2(has(c.baseAmount) ? D(c.baseAmount) : gross) : c.baseAmount }));
  const net = gross.add(dsum(charges.map((c) => c.amount))).sub(dsum(allowances.map((a) => a.amount)));
  return { ...line, net: s2(net), allowances, charges, price: { ...line.price, amount: price.toString() } };
}

const vatKey = (cat, rate) => `${cat}|${has(rate) ? D(rate).toString() : '0'}`;

/**
 * Recalculate an invoice model. Returns a new model with lines, totals and
 * vatBreakdown filled in. Exemption reasons are preserved per category.
 */
export function calculate(model) {
  const lines = (model.lines || []).map(calcLine);
  const lineNet = dsum(lines.map((l) => l.net));
  const baseForDoc = lineNet;
  const allowances = (model.allowances || []).map((a) => ({ ...a, charge: false, amount: s2(allowanceAmount(a, baseForDoc)), baseAmount: has(a.percent) ? s2(has(a.baseAmount) ? D(a.baseAmount) : baseForDoc) : a.baseAmount }));
  const charges = (model.charges || []).map((c) => ({ ...c, charge: true, amount: s2(allowanceAmount(c, baseForDoc)), baseAmount: has(c.percent) ? s2(has(c.baseAmount) ? D(c.baseAmount) : baseForDoc) : c.baseAmount }));
  const allowTotal = dsum(allowances.map((a) => a.amount));
  const chargeTotal = dsum(charges.map((c) => c.amount));
  const taxExclusive = lineNet.sub(allowTotal).add(chargeTotal);

  // VAT breakdown
  const groups = new Map();
  const group = (cat, rate) => {
    const c = cat || 'S';
    const rt = ZERO_RATED.has(c) ? '0' : has(rate) ? D(rate).toString() : '0';
    const k = vatKey(c, rt);
    if (!groups.has(k)) groups.set(k, { category: c, rate: rt, taxable: ZERO });
    return groups.get(k);
  };
  for (const l of lines) group(l.vat?.category, l.vat?.rate).taxable = group(l.vat?.category, l.vat?.rate).taxable.add(D(l.net));
  for (const a of allowances) group(a.vatCategory, a.vatRate).taxable = group(a.vatCategory, a.vatRate).taxable.sub(D(a.amount));
  for (const c of charges) group(c.vatCategory, c.vatRate).taxable = group(c.vatCategory, c.vatRate).taxable.add(D(c.amount));
  const prevBreakdown = model.vatBreakdown || [];
  const vatBreakdown = [...groups.values()].map((g) => {
    const tax = r2(g.taxable.mul(D(g.rate)).div(100, 10));
    const prev = prevBreakdown.find((p) => (p.category || 'S') === g.category) || {};
    return {
      taxable: s2(g.taxable),
      tax: s2(tax),
      category: g.category,
      rate: D(g.rate).toString(2),
      exemptionReason: g.category !== 'S' ? prev.exemptionReason : undefined,
      exemptionCode: g.category !== 'S' ? prev.exemptionCode : undefined,
    };
  });
  const taxAmount = dsum(vatBreakdown.map((v) => v.tax));
  const taxInclusive = taxExclusive.add(taxAmount);
  const prepaid = has(model.totals?.prepaid) ? D(model.totals.prepaid) : ZERO;
  const rounding = has(model.totals?.rounding) ? D(model.totals.rounding) : ZERO;
  const payable = taxInclusive.sub(prepaid).add(rounding);
  return {
    ...model,
    lines,
    allowances,
    charges,
    vatBreakdown,
    totals: {
      ...model.totals,
      lineNet: s2(lineNet),
      allowances: allowances.length ? s2(allowTotal) : undefined,
      charges: charges.length ? s2(chargeTotal) : undefined,
      taxExclusive: s2(taxExclusive),
      taxAmount: s2(taxAmount),
      taxInclusive: s2(taxInclusive),
      prepaid: has(model.totals?.prepaid) ? s2(prepaid) : undefined,
      rounding: has(model.totals?.rounding) ? s2(rounding) : undefined,
      payable: s2(payable),
    },
  };
}

export { Decimal };
