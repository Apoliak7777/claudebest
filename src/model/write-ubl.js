// Serialize an invoice model to Peppol BIS Billing 3.0 UBL 2.1 (Invoice or
// CreditNote). Element order follows the OASIS UBL 2.1 XSD.
import { el, serialize } from '../xml/writer.js';
import { NS, PEPPOL_CUSTOMIZATION, PEPPOL_PROFILE } from './ns.js';
import { calculate } from './calc.js';
import { D } from './decimal.js';

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const amt = (name, value, currency) => (has(value) ? el(name, { currencyID: currency }, value) : null);

function address(a) {
  if (!a) return null;
  return [
    el('cbc:StreetName', null, a.line1),
    el('cbc:AdditionalStreetName', null, a.line2),
    el('cbc:CityName', null, a.city),
    el('cbc:PostalZone', null, a.postalCode),
    el('cbc:CountrySubentity', null, a.subdivision),
    el('cac:AddressLine', null, el('cbc:Line', null, a.line3)),
    el('cac:Country', null, el('cbc:IdentificationCode', null, a.country)),
  ];
}

function party(p, { withEndpoint = true } = {}) {
  if (!p) return null;
  return el(
    'cac:Party',
    null,
    withEndpoint && p.endpoint ? el('cbc:EndpointID', { schemeID: p.endpoint.scheme }, p.endpoint.id) : null,
    (p.identifiers || []).map((i) => el('cac:PartyIdentification', null, el('cbc:ID', { schemeID: i.scheme }, i.id))),
    has(p.tradingName) ? el('cac:PartyName', null, el('cbc:Name', null, p.tradingName)) : null,
    el('cac:PostalAddress', null, address(p.address)),
    has(p.vatId) ? el('cac:PartyTaxScheme', null, el('cbc:CompanyID', null, p.vatId), el('cac:TaxScheme', null, el('cbc:ID', null, 'VAT'))) : null,
    has(p.taxRegId) ? el('cac:PartyTaxScheme', null, el('cbc:CompanyID', null, p.taxRegId), el('cac:TaxScheme', null, el('cbc:ID', null, 'FC'))) : null,
    el(
      'cac:PartyLegalEntity',
      null,
      el('cbc:RegistrationName', null, p.name),
      p.legalId ? el('cbc:CompanyID', { schemeID: p.legalId.scheme }, p.legalId.id) : null,
      el('cbc:CompanyLegalForm', null, p.additionalLegalInfo),
    ),
    p.contact ? el('cac:Contact', null, el('cbc:Name', null, p.contact.name), el('cbc:Telephone', null, p.contact.phone), el('cbc:ElectronicMail', null, p.contact.email)) : null,
  );
}

function taxCategory(tag, category, rate, extra = []) {
  return el(tag, null, el('cbc:ID', null, category), has(rate) ? el('cbc:Percent', null, rate) : null, extra, el('cac:TaxScheme', null, el('cbc:ID', null, 'VAT')));
}

function allowanceCharge(ac, currency, { withTax = true } = {}) {
  return el(
    'cac:AllowanceCharge',
    null,
    el('cbc:ChargeIndicator', null, ac.charge ? 'true' : 'false'),
    el('cbc:AllowanceChargeReasonCode', null, ac.reasonCode),
    el('cbc:AllowanceChargeReason', null, ac.reason),
    el('cbc:MultiplierFactorNumeric', null, ac.percent),
    amt('cbc:Amount', ac.amount, currency),
    amt('cbc:BaseAmount', ac.baseAmount, currency),
    withTax ? taxCategory('cac:TaxCategory', ac.vatCategory || 'S', ac.vatCategory === 'O' ? undefined : ac.vatRate) : null,
  );
}

// PEPPOL-EN16931-R046: net price = gross price - price discount
function priceDiscount(p) {
  if (has(p.discount)) return p.discount;
  if (has(p.amount)) return D(p.gross).sub(D(p.amount)).toString();
  return '0';
}

function line(l, m, isCredit) {
  const cur = m.currency;
  const p = l.price || {};
  return el(
    isCredit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
    null,
    el('cbc:ID', null, l.id),
    el('cbc:Note', null, l.note),
    el(isCredit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', { unitCode: l.unit || 'C62' }, l.quantity ?? '1'),
    amt('cbc:LineExtensionAmount', l.net, cur),
    el('cbc:AccountingCost', null, l.accountingCost),
    l.period && (has(l.period.start) || has(l.period.end)) ? el('cac:InvoicePeriod', null, el('cbc:StartDate', null, l.period.start), el('cbc:EndDate', null, l.period.end)) : null,
    has(l.orderLineRef) ? el('cac:OrderLineReference', null, el('cbc:LineID', null, l.orderLineRef)) : null,
    l.objectId ? el('cac:DocumentReference', null, el('cbc:ID', { schemeID: l.objectId.scheme }, l.objectId.id), el('cbc:DocumentTypeCode', null, '130')) : null,
    [...(l.charges || []), ...(l.allowances || [])].map((ac) => allowanceCharge(ac, cur, { withTax: false })),
    el(
      'cac:Item',
      null,
      el('cbc:Description', null, l.item?.description),
      el('cbc:Name', null, l.item?.name),
      has(l.item?.buyersId) ? el('cac:BuyersItemIdentification', null, el('cbc:ID', null, l.item.buyersId)) : null,
      has(l.item?.sellersId) ? el('cac:SellersItemIdentification', null, el('cbc:ID', null, l.item.sellersId)) : null,
      l.item?.standardId ? el('cac:StandardItemIdentification', null, el('cbc:ID', { schemeID: l.item.standardId.scheme }, l.item.standardId.id)) : null,
      has(l.item?.originCountry) ? el('cac:OriginCountry', null, el('cbc:IdentificationCode', null, l.item.originCountry)) : null,
      (l.item?.classifications || []).map((c) => el('cac:CommodityClassification', null, el('cbc:ItemClassificationCode', { listID: c.listId, listVersionID: c.listVersion }, c.id))),
      taxCategory('cac:ClassifiedTaxCategory', l.vat?.category || 'S', l.vat?.category === 'O' ? undefined : l.vat?.rate),
      (l.item?.attributes || []).map((a) => el('cac:AdditionalItemProperty', null, el('cbc:Name', null, a.name), el('cbc:Value', null, a.value))),
    ),
    el(
      'cac:Price',
      null,
      amt('cbc:PriceAmount', p.amount, cur),
      has(p.baseQuantity) ? el('cbc:BaseQuantity', { unitCode: p.baseUnit || l.unit || 'C62' }, p.baseQuantity) : null,
      has(p.gross) ? el('cac:AllowanceCharge', null, el('cbc:ChargeIndicator', null, 'false'), amt('cbc:Amount', priceDiscount(p), cur), amt('cbc:BaseAmount', p.gross, cur)) : null,
    ),
  );
}

/**
 * Build Peppol BIS 3.0 UBL XML from an invoice model.
 * @param {object} model invoice model (see readInvoice)
 * @param {{recalculate?: boolean, keepIds?: boolean}} [opts] recalculate totals/VAT from lines (default true);
 *   keepIds keeps the model's CustomizationID/ProfileID instead of the Peppol BIS 3.0 ones
 */
export function writeUbl(model, { recalculate = true, keepIds = false } = {}) {
  const m = recalculate ? calculate(model) : model;
  const isCredit = m.kind === 'creditnote' || ['381', '396', '81', '83', '532'].includes(String(m.typeCode));
  const cur = m.currency || 'EUR';
  const root = isCredit ? 'CreditNote' : 'Invoice';
  const t = m.totals || {};
  const docRefs = [];
  if (isCredit && has(m.projectReference)) docRefs.push(el('cac:AdditionalDocumentReference', null, el('cbc:ID', null, m.projectReference), el('cbc:DocumentTypeCode', null, '50')));
  if (m.invoicedObjectId) docRefs.push(el('cac:AdditionalDocumentReference', null, el('cbc:ID', { schemeID: m.invoicedObjectId.scheme }, m.invoicedObjectId.id), el('cbc:DocumentTypeCode', null, '130')));
  for (const a of m.attachments || []) {
    docRefs.push(
      el(
        'cac:AdditionalDocumentReference',
        null,
        el('cbc:ID', null, a.id),
        // UBL-SR-43: supporting documents carry no DocumentTypeCode (130/50 are reserved)
        el('cbc:DocumentDescription', null, a.description),
        el(
          'cac:Attachment',
          null,
          has(a.content) ? el('cbc:EmbeddedDocumentBinaryObject', { mimeCode: a.mimeCode, filename: a.filename }, a.content) : null,
          has(a.uri) ? el('cac:ExternalReference', null, el('cbc:URI', null, a.uri)) : null,
        ),
      ),
    );
  }
  const vatSubtotals = (m.vatBreakdown || []).map((v) =>
    el(
      'cac:TaxSubtotal',
      null,
      amt('cbc:TaxableAmount', v.taxable, cur),
      amt('cbc:TaxAmount', v.tax, cur),
      taxCategory('cac:TaxCategory', v.category, v.category === 'O' ? undefined : v.rate, [el('cbc:TaxExemptionReasonCode', null, v.exemptionCode), el('cbc:TaxExemptionReason', null, v.exemptionReason)]),
    ),
  );
  let mandateUsed = false; // UBL-SR-55: at most one payment mandate
  const paymentMeans = (m.paymentMeans || []).map((p) =>
    el(
      'cac:PaymentMeans',
      null,
      el('cbc:PaymentMeansCode', { name: p.text }, p.code || '30'),
      isCredit ? el('cbc:PaymentDueDate', null, m.dueDate) : null,
      el('cbc:PaymentID', null, p.remittanceInfo),
      p.card ? el('cac:CardAccount', null, el('cbc:PrimaryAccountNumberID', null, p.card.pan), el('cbc:NetworkID', null, 'NA'), el('cbc:HolderName', null, p.card.holder)) : null,
      (p.accounts || []).map((a) =>
        el('cac:PayeeFinancialAccount', null, el('cbc:ID', null, a.id && a.id.replace(/\s+/g, '')), el('cbc:Name', null, a.name), has(a.bic) ? el('cac:FinancialInstitutionBranch', null, el('cbc:ID', null, a.bic)) : null),
      ),
      p.mandate && !mandateUsed && (mandateUsed = true) ? el('cac:PaymentMandate', null, el('cbc:ID', null, p.mandate.id), has(p.mandate.debitedAccount) ? el('cac:PayerFinancialAccount', null, el('cbc:ID', null, p.mandate.debitedAccount)) : null) : null,
    ),
  );
  const delivery = m.delivery
    ? el(
        'cac:Delivery',
        null,
        el('cbc:ActualDeliveryDate', null, m.delivery.date),
        el('cac:DeliveryLocation', null, m.delivery.locationId ? el('cbc:ID', { schemeID: m.delivery.locationId.scheme }, m.delivery.locationId.id) : null, el('cac:Address', null, address(m.delivery.address))),
        has(m.delivery.partyName) ? el('cac:DeliveryParty', null, el('cac:PartyName', null, el('cbc:Name', null, m.delivery.partyName))) : null,
      )
    : null;

  const doc = el(
    root,
    { xmlns: isCredit ? NS.cn : NS.inv, 'xmlns:cac': NS.cac, 'xmlns:cbc': NS.cbc },
    el('cbc:CustomizationID', null, (keepIds && m.customizationId) || PEPPOL_CUSTOMIZATION),
    el('cbc:ProfileID', null, (keepIds && m.profileId) || (/^urn:fdc:peppol\.eu:2017:poacc:billing:\d\d:1\.0$/.test(m.profileId || '') ? m.profileId : PEPPOL_PROFILE)),
    el('cbc:ID', null, m.id),
    el('cbc:IssueDate', null, m.issueDate),
    isCredit ? null : el('cbc:DueDate', null, m.dueDate),
    isCredit ? null : el('cbc:InvoiceTypeCode', null, m.typeCode || '380'),
    isCredit ? el('cbc:TaxPointDate', null, m.taxPointDate) : null,
    isCredit ? el('cbc:CreditNoteTypeCode', null, m.typeCode || '381') : null,
    (m.notes || []).map((n) => el('cbc:Note', null, n)),
    isCredit ? null : el('cbc:TaxPointDate', null, m.taxPointDate),
    el('cbc:DocumentCurrencyCode', null, cur),
    el('cbc:TaxCurrencyCode', null, m.taxCurrency),
    el('cbc:AccountingCost', null, m.accountingCost),
    el('cbc:BuyerReference', null, m.buyerReference),
    m.invoicePeriod && (has(m.invoicePeriod.start) || has(m.invoicePeriod.end) || has(m.invoicePeriod.descriptionCode))
      ? el('cac:InvoicePeriod', null, el('cbc:StartDate', null, m.invoicePeriod.start), el('cbc:EndDate', null, m.invoicePeriod.end), el('cbc:DescriptionCode', null, m.invoicePeriod.descriptionCode))
      : null,
    has(m.orderReference) || has(m.salesOrderReference) ? el('cac:OrderReference', null, el('cbc:ID', null, m.orderReference || 'NA'), el('cbc:SalesOrderID', null, m.salesOrderReference)) : null,
    (m.precedingInvoices || []).map((b) => el('cac:BillingReference', null, el('cac:InvoiceDocumentReference', null, el('cbc:ID', null, b.id), el('cbc:IssueDate', null, b.issueDate)))),
    has(m.despatchAdviceReference) ? el('cac:DespatchDocumentReference', null, el('cbc:ID', null, m.despatchAdviceReference)) : null,
    has(m.receivingAdviceReference) ? el('cac:ReceiptDocumentReference', null, el('cbc:ID', null, m.receivingAdviceReference)) : null,
    has(m.tenderReference) ? el('cac:OriginatorDocumentReference', null, el('cbc:ID', null, m.tenderReference)) : null,
    has(m.contractReference) ? el('cac:ContractDocumentReference', null, el('cbc:ID', null, m.contractReference)) : null,
    docRefs,
    !isCredit && has(m.projectReference) ? el('cac:ProjectReference', null, el('cbc:ID', null, m.projectReference)) : null,
    el('cac:AccountingSupplierParty', null, party(m.seller)),
    el('cac:AccountingCustomerParty', null, party(m.buyer)),
    m.payee
      ? el(
          'cac:PayeeParty',
          null,
          m.payee.identifier ? el('cac:PartyIdentification', null, el('cbc:ID', { schemeID: m.payee.identifier.scheme }, m.payee.identifier.id)) : null,
          el('cac:PartyName', null, el('cbc:Name', null, m.payee.name)),
          m.payee.legalId ? el('cac:PartyLegalEntity', null, el('cbc:CompanyID', { schemeID: m.payee.legalId.scheme }, m.payee.legalId.id)) : null,
        )
      : null,
    m.taxRepresentative
      ? el(
          'cac:TaxRepresentativeParty',
          null,
          el('cac:PartyName', null, el('cbc:Name', null, m.taxRepresentative.name)),
          el('cac:PostalAddress', null, address(m.taxRepresentative.address)),
          el('cac:PartyTaxScheme', null, el('cbc:CompanyID', null, m.taxRepresentative.vatId), el('cac:TaxScheme', null, el('cbc:ID', null, 'VAT'))),
        )
      : null,
    delivery,
    paymentMeans,
    has(m.paymentTerms) ? el('cac:PaymentTerms', null, el('cbc:Note', null, m.paymentTerms)) : null,
    [...(m.charges || []), ...(m.allowances || [])].map((ac) => allowanceCharge(ac, cur)),
    el('cac:TaxTotal', null, amt('cbc:TaxAmount', t.taxAmount ?? '0.00', cur), vatSubtotals),
    has(m.taxCurrency) && has(t.taxAmountInTaxCurrency) ? el('cac:TaxTotal', null, amt('cbc:TaxAmount', t.taxAmountInTaxCurrency, m.taxCurrency)) : null,
    el(
      'cac:LegalMonetaryTotal',
      null,
      amt('cbc:LineExtensionAmount', t.lineNet, cur),
      amt('cbc:TaxExclusiveAmount', t.taxExclusive, cur),
      amt('cbc:TaxInclusiveAmount', t.taxInclusive, cur),
      amt('cbc:AllowanceTotalAmount', t.allowances, cur),
      amt('cbc:ChargeTotalAmount', t.charges, cur),
      amt('cbc:PrepaidAmount', t.prepaid, cur),
      amt('cbc:PayableRoundingAmount', t.rounding, cur),
      amt('cbc:PayableAmount', t.payable, cur),
    ),
    (m.lines || []).map((l, i) => line({ ...l, id: l.id || String(i + 1) }, m, isCredit)),
  );
  return serialize(doc);
}
