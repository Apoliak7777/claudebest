// Read UBL 2.1 (Invoice / CreditNote) and UN/CEFACT CII D16B documents into
// one syntax-neutral invoice model keyed by EN 16931 business terms (BT/BG).
import { parseXml, ELEMENT, TEXT, stringValue } from '../xml/parser.js';
import { NS, detectDocument } from './ns.js';

// ---------- tiny path helpers (prefix:Local/prefix:Local) ----------
const stepCache = new Map();
function steps(path) {
  let s = stepCache.get(path);
  if (!s) {
    s = path.split('/').map((p) => {
      const [pre, local] = p.split(':');
      return { ns: NS[pre], local };
    });
    stepCache.set(path, s);
  }
  return s;
}

export function all(el, path) {
  if (!el) return [];
  let cur = [el];
  for (const st of steps(path)) {
    const next = [];
    for (const c of cur) for (const k of c.children) if (k.kind === ELEMENT && k.local === st.local && k.ns === st.ns) next.push(k);
    cur = next;
    if (!cur.length) break;
  }
  return cur;
}
export const get = (el, path) => all(el, path)[0];
export function txt(el, path) {
  const e = path ? get(el, path) : el;
  if (!e) return undefined;
  const v = stringValue(e).trim();
  return v === '' ? undefined : v;
}
export function att(el, path, name) {
  const e = path ? get(el, path) : el;
  if (!e) return undefined;
  const a = e.attrs.find((x) => x.name === name);
  return a ? a.value : undefined;
}
const idv = (el, path, schemeAttr = 'schemeID') => {
  const e = path ? get(el, path) : el;
  if (!e) return undefined;
  const id = txt(e);
  if (id === undefined) return undefined;
  return { id, scheme: att(e, null, schemeAttr) };
};
const compact = (o) => {
  if (Array.isArray(o)) {
    const a = o.map(compact).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (o && typeof o === 'object' && !(o instanceof Uint8Array)) {
    const out = {};
    let any = false;
    for (const [k, v] of Object.entries(o)) {
      const c = compact(v);
      if (c !== undefined) {
        out[k] = c;
        any = true;
      }
    }
    return any ? out : undefined;
  }
  return o === '' ? undefined : o;
};

// ---------- UBL ----------

function ublAddress(a) {
  if (!a) return undefined;
  return {
    line1: txt(a, 'cbc:StreetName'),
    line2: txt(a, 'cbc:AdditionalStreetName'),
    line3: txt(a, 'cac:AddressLine/cbc:Line'),
    city: txt(a, 'cbc:CityName'),
    postalCode: txt(a, 'cbc:PostalZone'),
    subdivision: txt(a, 'cbc:CountrySubentity'),
    country: txt(a, 'cac:Country/cbc:IdentificationCode'),
  };
}

function ublParty(p) {
  if (!p) return undefined;
  const taxSchemes = all(p, 'cac:PartyTaxScheme');
  const vat = taxSchemes.find((t) => (txt(t, 'cac:TaxScheme/cbc:ID') || '').toUpperCase() === 'VAT');
  const other = taxSchemes.find((t) => (txt(t, 'cac:TaxScheme/cbc:ID') || '').toUpperCase() !== 'VAT');
  const legal = get(p, 'cac:PartyLegalEntity');
  return {
    name: txt(legal, 'cbc:RegistrationName') || txt(p, 'cac:PartyName/cbc:Name'),
    tradingName: txt(p, 'cac:PartyName/cbc:Name') !== txt(legal, 'cbc:RegistrationName') ? txt(p, 'cac:PartyName/cbc:Name') : undefined,
    identifiers: all(p, 'cac:PartyIdentification/cbc:ID').map((e) => idv(e)),
    legalId: idv(legal, 'cbc:CompanyID'),
    vatId: txt(vat, 'cbc:CompanyID'),
    taxRegId: txt(other, 'cbc:CompanyID'),
    additionalLegalInfo: txt(legal, 'cbc:CompanyLegalForm'),
    endpoint: idv(p, 'cbc:EndpointID'),
    address: ublAddress(get(p, 'cac:PostalAddress')),
    contact: {
      name: txt(p, 'cac:Contact/cbc:Name'),
      phone: txt(p, 'cac:Contact/cbc:Telephone'),
      email: txt(p, 'cac:Contact/cbc:ElectronicMail'),
    },
  };
}

function ublAllowanceCharge(ac) {
  return {
    charge: txt(ac, 'cbc:ChargeIndicator') === 'true',
    amount: txt(ac, 'cbc:Amount'),
    baseAmount: txt(ac, 'cbc:BaseAmount'),
    percent: txt(ac, 'cbc:MultiplierFactorNumeric'),
    vatCategory: txt(ac, 'cac:TaxCategory/cbc:ID'),
    vatRate: txt(ac, 'cac:TaxCategory/cbc:Percent'),
    reason: txt(ac, 'cbc:AllowanceChargeReason'),
    reasonCode: txt(ac, 'cbc:AllowanceChargeReasonCode'),
  };
}

function ublAttachment(r) {
  const bin = get(r, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject');
  return {
    id: txt(r, 'cbc:ID'),
    typeCode: txt(r, 'cbc:DocumentTypeCode'),
    description: txt(r, 'cbc:DocumentDescription'),
    uri: txt(r, 'cac:Attachment/cac:ExternalReference/cbc:URI'),
    mimeCode: bin ? att(bin, null, 'mimeCode') : undefined,
    filename: bin ? att(bin, null, 'filename') : undefined,
    content: bin ? stringValue(bin).replace(/\s+/g, '') || undefined : undefined,
  };
}

function ublLine(l, isCredit) {
  const qtyEl = get(l, isCredit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity');
  const price = get(l, 'cac:Price');
  const priceAc = get(price, 'cac:AllowanceCharge');
  const item = get(l, 'cac:Item');
  return {
    id: txt(l, 'cbc:ID'),
    note: txt(l, 'cbc:Note'),
    objectId: idv(l, 'cac:DocumentReference/cbc:ID'),
    quantity: txt(qtyEl),
    unit: att(qtyEl, null, 'unitCode'),
    net: txt(l, 'cbc:LineExtensionAmount'),
    orderLineRef: txt(l, 'cac:OrderLineReference/cbc:LineID'),
    accountingCost: txt(l, 'cbc:AccountingCost'),
    period: { start: txt(l, 'cac:InvoicePeriod/cbc:StartDate'), end: txt(l, 'cac:InvoicePeriod/cbc:EndDate') },
    allowances: all(l, 'cac:AllowanceCharge').map(ublAllowanceCharge).filter((a) => !a.charge),
    charges: all(l, 'cac:AllowanceCharge').map(ublAllowanceCharge).filter((a) => a.charge),
    price: {
      amount: txt(price, 'cbc:PriceAmount'),
      discount: txt(priceAc, 'cbc:Amount'),
      gross: txt(priceAc, 'cbc:BaseAmount'),
      baseQuantity: txt(price, 'cbc:BaseQuantity'),
      baseUnit: att(price, 'cbc:BaseQuantity', 'unitCode'),
    },
    vat: {
      category: txt(item, 'cac:ClassifiedTaxCategory/cbc:ID'),
      rate: txt(item, 'cac:ClassifiedTaxCategory/cbc:Percent'),
    },
    item: {
      name: txt(item, 'cbc:Name'),
      description: txt(item, 'cbc:Description'),
      sellersId: txt(item, 'cac:SellersItemIdentification/cbc:ID'),
      buyersId: txt(item, 'cac:BuyersItemIdentification/cbc:ID'),
      standardId: idv(item, 'cac:StandardItemIdentification/cbc:ID'),
      classifications: all(item, 'cac:CommodityClassification/cbc:ItemClassificationCode').map((e) => ({
        id: txt(e),
        listId: att(e, null, 'listID'),
        listVersion: att(e, null, 'listVersionID'),
      })),
      originCountry: txt(item, 'cac:OriginCountry/cbc:IdentificationCode'),
      attributes: all(item, 'cac:AdditionalItemProperty').map((a) => ({ name: txt(a, 'cbc:Name'), value: txt(a, 'cbc:Value') })),
    },
  };
}

function readUbl(r, kind) {
  const isCredit = kind === 'creditnote';
  const lm = get(r, 'cac:LegalMonetaryTotal');
  const taxTotals = all(r, 'cac:TaxTotal');
  const currency = txt(r, 'cbc:DocumentCurrencyCode');
  const taxCurrency = txt(r, 'cbc:TaxCurrencyCode');
  const withSub = taxTotals.find((t) => get(t, 'cac:TaxSubtotal')) || taxTotals.find((t) => att(t, 'cbc:TaxAmount', 'currencyID') === currency) || taxTotals[0];
  const inTaxCur = taxCurrency ? taxTotals.find((t) => att(t, 'cbc:TaxAmount', 'currencyID') === taxCurrency && t !== withSub) : undefined;
  const pm = all(r, 'cac:PaymentMeans');
  const delivery = get(r, 'cac:Delivery');
  const payee = get(r, 'cac:PayeeParty');
  const taxRep = get(r, 'cac:TaxRepresentativeParty');
  const docRefs = all(r, 'cac:AdditionalDocumentReference');
  const projectRef = isCredit ? docRefs.find((d) => txt(d, 'cbc:DocumentTypeCode') === '50') : undefined;
  const objRef = docRefs.find((d) => txt(d, 'cbc:DocumentTypeCode') === '130');
  const attachments = docRefs.filter((d) => d !== projectRef && d !== objRef);
  return {
    syntax: 'UBL',
    kind,
    customizationId: txt(r, 'cbc:CustomizationID'),
    profileId: txt(r, 'cbc:ProfileID'),
    id: txt(r, 'cbc:ID'),
    issueDate: txt(r, 'cbc:IssueDate'),
    typeCode: txt(r, isCredit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode'),
    currency,
    taxCurrency,
    taxPointDate: txt(r, 'cbc:TaxPointDate'),
    dueDate: txt(r, 'cbc:DueDate') || (isCredit ? pm.map((p) => txt(p, 'cbc:PaymentDueDate')).find(Boolean) : undefined),
    buyerReference: txt(r, 'cbc:BuyerReference'),
    projectReference: isCredit ? txt(projectRef, 'cbc:ID') : txt(r, 'cac:ProjectReference/cbc:ID'),
    contractReference: txt(r, 'cac:ContractDocumentReference/cbc:ID'),
    orderReference: txt(r, 'cac:OrderReference/cbc:ID'),
    salesOrderReference: txt(r, 'cac:OrderReference/cbc:SalesOrderID'),
    receivingAdviceReference: txt(r, 'cac:ReceiptDocumentReference/cbc:ID'),
    despatchAdviceReference: txt(r, 'cac:DespatchDocumentReference/cbc:ID'),
    tenderReference: txt(r, 'cac:OriginatorDocumentReference/cbc:ID'),
    invoicedObjectId: objRef ? idv(objRef, 'cbc:ID') : undefined,
    accountingCost: txt(r, 'cbc:AccountingCost'),
    paymentTerms: txt(r, 'cac:PaymentTerms/cbc:Note'),
    notes: all(r, 'cbc:Note').map((n) => txt(n)),
    precedingInvoices: all(r, 'cac:BillingReference/cac:InvoiceDocumentReference').map((b) => ({ id: txt(b, 'cbc:ID'), issueDate: txt(b, 'cbc:IssueDate') })),
    seller: ublParty(get(r, 'cac:AccountingSupplierParty/cac:Party')),
    buyer: ublParty(get(r, 'cac:AccountingCustomerParty/cac:Party')),
    payee: payee ? { name: txt(payee, 'cac:PartyName/cbc:Name'), identifier: idv(payee, 'cac:PartyIdentification/cbc:ID'), legalId: idv(payee, 'cac:PartyLegalEntity/cbc:CompanyID') } : undefined,
    taxRepresentative: taxRep ? { name: txt(taxRep, 'cac:PartyName/cbc:Name'), vatId: txt(taxRep, 'cac:PartyTaxScheme/cbc:CompanyID'), address: ublAddress(get(taxRep, 'cac:PostalAddress')) } : undefined,
    delivery: delivery
      ? {
          partyName: txt(delivery, 'cac:DeliveryParty/cac:PartyName/cbc:Name'),
          locationId: idv(delivery, 'cac:DeliveryLocation/cbc:ID'),
          date: txt(delivery, 'cbc:ActualDeliveryDate'),
          address: ublAddress(get(delivery, 'cac:DeliveryLocation/cac:Address')),
        }
      : undefined,
    invoicePeriod: { start: txt(r, 'cac:InvoicePeriod/cbc:StartDate'), end: txt(r, 'cac:InvoicePeriod/cbc:EndDate'), descriptionCode: txt(r, 'cac:InvoicePeriod/cbc:DescriptionCode') },
    paymentMeans: pm.map((p) => ({
      code: txt(p, 'cbc:PaymentMeansCode'),
      text: att(p, 'cbc:PaymentMeansCode', 'name'),
      remittanceInfo: txt(p, 'cbc:PaymentID'),
      accounts: all(p, 'cac:PayeeFinancialAccount').map((a) => ({
        id: txt(a, 'cbc:ID'),
        name: txt(a, 'cbc:Name'),
        bic: txt(a, 'cac:FinancialInstitutionBranch/cbc:ID'),
      })),
      card: get(p, 'cac:CardAccount') ? { pan: txt(p, 'cac:CardAccount/cbc:PrimaryAccountNumberID'), holder: txt(p, 'cac:CardAccount/cbc:HolderName') } : undefined,
      mandate: get(p, 'cac:PaymentMandate')
        ? { id: txt(p, 'cac:PaymentMandate/cbc:ID'), debitedAccount: txt(p, 'cac:PaymentMandate/cac:PayerFinancialAccount/cbc:ID') }
        : undefined,
    })),
    creditorId: all(r, 'cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID').map((e) => idv(e)).find((x) => x.scheme === 'SEPA')?.id,
    allowances: all(r, 'cac:AllowanceCharge').map(ublAllowanceCharge).filter((a) => !a.charge),
    charges: all(r, 'cac:AllowanceCharge').map(ublAllowanceCharge).filter((a) => a.charge),
    totals: {
      lineNet: txt(lm, 'cbc:LineExtensionAmount'),
      allowances: txt(lm, 'cbc:AllowanceTotalAmount'),
      charges: txt(lm, 'cbc:ChargeTotalAmount'),
      taxExclusive: txt(lm, 'cbc:TaxExclusiveAmount'),
      taxAmount: txt(withSub, 'cbc:TaxAmount'),
      taxAmountInTaxCurrency: txt(inTaxCur, 'cbc:TaxAmount'),
      taxInclusive: txt(lm, 'cbc:TaxInclusiveAmount'),
      prepaid: txt(lm, 'cbc:PrepaidAmount'),
      rounding: txt(lm, 'cbc:PayableRoundingAmount'),
      payable: txt(lm, 'cbc:PayableAmount'),
    },
    vatBreakdown: all(withSub, 'cac:TaxSubtotal').map((s) => ({
      taxable: txt(s, 'cbc:TaxableAmount'),
      tax: txt(s, 'cbc:TaxAmount'),
      category: txt(s, 'cac:TaxCategory/cbc:ID'),
      rate: txt(s, 'cac:TaxCategory/cbc:Percent'),
      exemptionReason: txt(s, 'cac:TaxCategory/cbc:TaxExemptionReason'),
      exemptionCode: txt(s, 'cac:TaxCategory/cbc:TaxExemptionReasonCode'),
    })),
    attachments: attachments.map(ublAttachment),
    lines: all(r, isCredit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine').map((l) => ublLine(l, isCredit)),
  };
}

// ---------- CII ----------

function ciiDate(el) {
  const s = txt(el, 'udt:DateTimeString');
  if (!s) return undefined;
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

function ciiAddress(a) {
  if (!a) return undefined;
  return {
    line1: txt(a, 'ram:LineOne'),
    line2: txt(a, 'ram:LineTwo'),
    line3: txt(a, 'ram:LineThree'),
    city: txt(a, 'ram:CityName'),
    postalCode: txt(a, 'ram:PostcodeCode'),
    subdivision: txt(a, 'ram:CountrySubDivisionName'),
    country: txt(a, 'ram:CountryID'),
  };
}

function ciiParty(p) {
  if (!p) return undefined;
  const regs = all(p, 'ram:SpecifiedTaxRegistration');
  const vat = regs.find((t) => att(t, 'ram:ID', 'schemeID') === 'VA');
  const fc = regs.find((t) => att(t, 'ram:ID', 'schemeID') === 'FC');
  const legal = get(p, 'ram:SpecifiedLegalOrganization');
  return {
    name: txt(p, 'ram:Name'),
    tradingName: txt(legal, 'ram:TradingBusinessName'),
    identifiers: [...all(p, 'ram:ID').map((e) => idv(e)), ...all(p, 'ram:GlobalID').map((e) => idv(e))],
    legalId: idv(legal, 'ram:ID'),
    vatId: txt(vat, 'ram:ID'),
    taxRegId: txt(fc, 'ram:ID'),
    additionalLegalInfo: txt(p, 'ram:Description'),
    endpoint: idv(p, 'ram:URIUniversalCommunication/ram:URIID'),
    address: ciiAddress(get(p, 'ram:PostalTradeAddress')),
    contact: {
      name: txt(p, 'ram:DefinedTradeContact/ram:PersonName') || txt(p, 'ram:DefinedTradeContact/ram:DepartmentName'),
      phone: txt(p, 'ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber'),
      email: txt(p, 'ram:DefinedTradeContact/ram:EmailURIUniversalCommunication/ram:URIID'),
    },
  };
}

function ciiAllowanceCharge(ac) {
  return {
    charge: txt(ac, 'ram:ChargeIndicator/udt:Indicator') === 'true',
    amount: txt(ac, 'ram:ActualAmount'),
    baseAmount: txt(ac, 'ram:BasisAmount'),
    percent: txt(ac, 'ram:CalculationPercent'),
    vatCategory: txt(ac, 'ram:CategoryTradeTax/ram:CategoryCode'),
    vatRate: txt(ac, 'ram:CategoryTradeTax/ram:RateApplicablePercent'),
    reason: txt(ac, 'ram:Reason'),
    reasonCode: txt(ac, 'ram:ReasonCode'),
  };
}

function readCii(r) {
  const ctx = get(r, 'rsm:ExchangedDocumentContext');
  const ed = get(r, 'rsm:ExchangedDocument');
  const tx = get(r, 'rsm:SupplyChainTradeTransaction');
  const agr = get(tx, 'ram:ApplicableHeaderTradeAgreement');
  const del = get(tx, 'ram:ApplicableHeaderTradeDelivery');
  const set = get(tx, 'ram:ApplicableHeaderTradeSettlement');
  const sum = get(set, 'ram:SpecifiedTradeSettlementHeaderMonetarySummation');
  const currency = txt(set, 'ram:InvoiceCurrencyCode');
  const taxCurrency = txt(set, 'ram:TaxCurrencyCode');
  const taxTotals = all(sum, 'ram:TaxTotalAmount');
  const taxMain = taxTotals.find((t) => att(t, null, 'currencyID') === currency) || taxTotals[0];
  const taxAcc = taxCurrency ? taxTotals.find((t) => att(t, null, 'currencyID') === taxCurrency && t !== taxMain) : undefined;
  const acs = all(set, 'ram:SpecifiedTradeAllowanceCharge').map(ciiAllowanceCharge);
  const docs = all(agr, 'ram:AdditionalReferencedDocument');
  const objRef = docs.find((d) => txt(d, 'ram:TypeCode') === '130');
  const tenderRef = docs.find((d) => txt(d, 'ram:TypeCode') === '50');
  const typeCode = txt(ed, 'ram:TypeCode');
  const payees = get(set, 'ram:PayeeTradeParty');
  const taxRep = get(agr, 'ram:SellerTaxRepresentativeTradeParty');
  const shipTo = get(del, 'ram:ShipToTradeParty');
  return {
    syntax: 'CII',
    kind: ['381', '396', '81', '83', '532'].includes(typeCode) ? 'creditnote' : 'invoice',
    customizationId: txt(ctx, 'ram:GuidelineSpecifiedDocumentContextParameter/ram:ID'),
    profileId: txt(ctx, 'ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID'),
    id: txt(ed, 'ram:ID'),
    issueDate: ciiDate(get(ed, 'ram:IssueDateTime')),
    typeCode,
    currency,
    taxCurrency,
    taxPointDate: ciiDate(get(set, 'ram:ApplicableTradeTax/ram:TaxPointDate')),
    dueDate: ciiDate(get(set, 'ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime')),
    buyerReference: txt(agr, 'ram:BuyerReference'),
    projectReference: txt(agr, 'ram:SpecifiedProcuringProject/ram:ID'),
    contractReference: txt(agr, 'ram:ContractReferencedDocument/ram:IssuerAssignedID'),
    orderReference: txt(agr, 'ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID'),
    salesOrderReference: txt(agr, 'ram:SellerOrderReferencedDocument/ram:IssuerAssignedID'),
    receivingAdviceReference: txt(del, 'ram:ReceivingAdviceReferencedDocument/ram:IssuerAssignedID'),
    despatchAdviceReference: txt(del, 'ram:DespatchAdviceReferencedDocument/ram:IssuerAssignedID'),
    tenderReference: txt(tenderRef, 'ram:IssuerAssignedID'),
    invoicedObjectId: objRef ? { id: txt(objRef, 'ram:IssuerAssignedID'), scheme: txt(objRef, 'ram:ReferenceTypeCode') } : undefined,
    accountingCost: txt(set, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID'),
    paymentTerms: txt(set, 'ram:SpecifiedTradePaymentTerms/ram:Description'),
    notes: all(ed, 'ram:IncludedNote').map((n) => txt(n, 'ram:Content')),
    precedingInvoices: all(set, 'ram:InvoiceReferencedDocument').map((b) => ({ id: txt(b, 'ram:IssuerAssignedID'), issueDate: ciiDate(get(b, 'ram:FormattedIssueDateTime')) })),
    seller: ciiParty(get(agr, 'ram:SellerTradeParty')),
    buyer: ciiParty(get(agr, 'ram:BuyerTradeParty')),
    payee: payees ? { name: txt(payees, 'ram:Name'), identifier: idv(payees, 'ram:ID') || idv(payees, 'ram:GlobalID'), legalId: idv(payees, 'ram:SpecifiedLegalOrganization/ram:ID') } : undefined,
    taxRepresentative: taxRep ? { name: txt(taxRep, 'ram:Name'), vatId: txt(taxRep, 'ram:SpecifiedTaxRegistration/ram:ID'), address: ciiAddress(get(taxRep, 'ram:PostalTradeAddress')) } : undefined,
    delivery:
      shipTo || get(del, 'ram:ActualDeliverySupplyChainEvent')
        ? {
            partyName: txt(shipTo, 'ram:Name'),
            locationId: idv(shipTo, 'ram:ID') || idv(shipTo, 'ram:GlobalID'),
            date: ciiDate(get(del, 'ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime')),
            address: ciiAddress(get(shipTo, 'ram:PostalTradeAddress')),
          }
        : undefined,
    invoicePeriod: {
      start: ciiDate(get(set, 'ram:BillingSpecifiedPeriod/ram:StartDateTime')),
      end: ciiDate(get(set, 'ram:BillingSpecifiedPeriod/ram:EndDateTime')),
    },
    paymentMeans: all(set, 'ram:SpecifiedTradeSettlementPaymentMeans').map((p) => ({
      code: txt(p, 'ram:TypeCode'),
      text: txt(p, 'ram:Information'),
      remittanceInfo: txt(set, 'ram:PaymentReference'),
      accounts: all(p, 'ram:PayeePartyCreditorFinancialAccount').map((a) => ({
        id: txt(a, 'ram:IBANID') || txt(a, 'ram:ProprietaryID'),
        name: txt(a, 'ram:AccountName'),
        bic: txt(p, 'ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID'),
      })),
      card: get(p, 'ram:ApplicableTradeSettlementFinancialCard') ? { pan: txt(p, 'ram:ApplicableTradeSettlementFinancialCard/ram:ID'), holder: txt(p, 'ram:ApplicableTradeSettlementFinancialCard/ram:CardholderName') } : undefined,
      mandate: ['49', '59'].includes(txt(p, 'ram:TypeCode')) && get(set, 'ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID')
        ? { id: txt(set, 'ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID'), debitedAccount: txt(p, 'ram:PayerPartyDebtorFinancialAccount/ram:IBANID') }
        : undefined,
    })),
    creditorId: txt(set, 'ram:CreditorReferenceID'),
    allowances: acs.filter((a) => !a.charge),
    charges: acs.filter((a) => a.charge),
    totals: {
      lineNet: txt(sum, 'ram:LineTotalAmount'),
      allowances: txt(sum, 'ram:AllowanceTotalAmount'),
      charges: txt(sum, 'ram:ChargeTotalAmount'),
      taxExclusive: txt(sum, 'ram:TaxBasisTotalAmount'),
      taxAmount: txt(taxMain),
      taxAmountInTaxCurrency: txt(taxAcc),
      taxInclusive: txt(sum, 'ram:GrandTotalAmount'),
      prepaid: txt(sum, 'ram:TotalPrepaidAmount'),
      rounding: txt(sum, 'ram:RoundingAmount'),
      payable: txt(sum, 'ram:DuePayableAmount'),
    },
    vatBreakdown: all(set, 'ram:ApplicableTradeTax').map((t) => ({
      taxable: txt(t, 'ram:BasisAmount'),
      tax: txt(t, 'ram:CalculatedAmount'),
      category: txt(t, 'ram:CategoryCode'),
      rate: txt(t, 'ram:RateApplicablePercent'),
      exemptionReason: txt(t, 'ram:ExemptionReason'),
      exemptionCode: txt(t, 'ram:ExemptionReasonCode'),
    })),
    attachments: docs
      .filter((d) => d !== objRef && d !== tenderRef)
      .map((d) => {
        const bin = get(d, 'ram:AttachmentBinaryObject');
        return {
          id: txt(d, 'ram:IssuerAssignedID'),
          typeCode: txt(d, 'ram:TypeCode'),
          description: txt(d, 'ram:Name'),
          uri: txt(d, 'ram:URIID'),
          mimeCode: bin ? att(bin, null, 'mimeCode') : undefined,
          filename: bin ? att(bin, null, 'filename') : undefined,
          content: bin ? stringValue(bin).replace(/\s+/g, '') || undefined : undefined,
        };
      }),
    lines: all(tx, 'ram:IncludedSupplyChainTradeLineItem').map((l) => {
      const la = get(l, 'ram:SpecifiedLineTradeAgreement');
      const ld = get(l, 'ram:SpecifiedLineTradeDelivery');
      const ls = get(l, 'ram:SpecifiedLineTradeSettlement');
      const prod = get(l, 'ram:SpecifiedTradeProduct');
      const qty = get(ld, 'ram:BilledQuantity');
      const net = get(la, 'ram:NetPriceProductTradePrice');
      const gross = get(la, 'ram:GrossPriceProductTradePrice');
      const lacs = all(ls, 'ram:SpecifiedTradeAllowanceCharge').map(ciiAllowanceCharge);
      return {
        id: txt(l, 'ram:AssociatedDocumentLineDocument/ram:LineID'),
        note: txt(l, 'ram:AssociatedDocumentLineDocument/ram:IncludedNote/ram:Content'),
        objectId: idv(ls, 'ram:AdditionalReferencedDocument/ram:IssuerAssignedID', 'schemeID'),
        quantity: txt(qty),
        unit: att(qty, null, 'unitCode'),
        net: txt(ls, 'ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount'),
        orderLineRef: txt(la, 'ram:BuyerOrderReferencedDocument/ram:LineID'),
        accountingCost: txt(ls, 'ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID'),
        period: { start: ciiDate(get(ls, 'ram:BillingSpecifiedPeriod/ram:StartDateTime')), end: ciiDate(get(ls, 'ram:BillingSpecifiedPeriod/ram:EndDateTime')) },
        allowances: lacs.filter((a) => !a.charge),
        charges: lacs.filter((a) => a.charge),
        price: {
          amount: txt(net, 'ram:ChargeAmount'),
          discount: txt(gross, 'ram:AppliedTradeAllowanceCharge/ram:ActualAmount'),
          gross: txt(gross, 'ram:ChargeAmount'),
          baseQuantity: txt(net, 'ram:BasisQuantity'),
          baseUnit: att(net, 'ram:BasisQuantity', 'unitCode'),
        },
        vat: { category: txt(ls, 'ram:ApplicableTradeTax/ram:CategoryCode'), rate: txt(ls, 'ram:ApplicableTradeTax/ram:RateApplicablePercent') },
        item: {
          name: txt(prod, 'ram:Name'),
          description: txt(prod, 'ram:Description'),
          sellersId: txt(prod, 'ram:SellerAssignedID'),
          buyersId: txt(prod, 'ram:BuyerAssignedID'),
          standardId: idv(prod, 'ram:GlobalID'),
          classifications: all(prod, 'ram:DesignatedProductClassification/ram:ClassCode').map((e) => ({ id: txt(e), listId: att(e, null, 'listID'), listVersion: att(e, null, 'listVersionID') })),
          originCountry: txt(prod, 'ram:OriginTradeCountry/ram:ID'),
          attributes: all(prod, 'ram:ApplicableProductCharacteristic').map((a) => ({ name: txt(a, 'ram:Description'), value: txt(a, 'ram:Value') })),
        },
      };
    }),
  };
}

/**
 * Read an invoice from XML text or a parsed document.
 * @returns {object} invoice model (see docs/MODEL.md)
 */
export function readInvoice(input) {
  const doc = typeof input === 'string' ? parseXml(input) : input;
  const { syntax, kind } = detectDocument(doc);
  if (!syntax) throw new Error(`Nepodporovaný dokument <${doc.root.name}> – očakávaná UBL faktúra/dobropis alebo CII faktúra`);
  const model = syntax === 'UBL' ? readUbl(doc.root, kind) : readCii(doc.root);
  // keep arrays even when empty for easier consumption
  const c = compact(model) || {};
  for (const k of ['notes', 'precedingInvoices', 'paymentMeans', 'allowances', 'charges', 'vatBreakdown', 'attachments', 'lines']) c[k] = c[k] || [];
  c.totals = c.totals || {};
  for (const l of c.lines) {
    l.allowances = l.allowances || [];
    l.charges = l.charges || [];
    l.item = l.item || {};
    l.price = l.price || {};
    l.vat = l.vat || {};
  }
  return c;
}
