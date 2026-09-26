// Namespace URIs used across the SDK.
export const NS = {
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

export const PEPPOL_CUSTOMIZATION = 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
export const PEPPOL_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

/** Detect document syntax/type from a parsed XML document. */
export function detectDocument(doc) {
  const r = doc.root;
  if (r.ns === NS.inv && r.local === 'Invoice') return { syntax: 'UBL', kind: 'invoice' };
  if (r.ns === NS.cn && r.local === 'CreditNote') return { syntax: 'UBL', kind: 'creditnote' };
  if (r.ns === NS.rsm && r.local === 'CrossIndustryInvoice') return { syntax: 'CII', kind: 'invoice' };
  return { syntax: null, kind: null };
}
