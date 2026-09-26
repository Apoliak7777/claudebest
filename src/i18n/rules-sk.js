// Slovak explanations of the official EN 16931 / Peppol BIS 3.0 rule messages.
// Hand-written for business rules; template-based for rule families
// (decimals, VAT categories, syntax restrictions). The official English text is
// always kept alongside in the report.
import { term } from './terms-sk.js';

// codes only: the Slovak sentence already names the term
const T = (code) => `(${code})`;

export const RULES_SK = {
  'BR-01': `Chýba identifikátor špecifikácie ${T('BT-24')}.`,
  'BR-02': `Chýba číslo faktúry ${T('BT-1')}.`,
  'BR-03': `Chýba dátum vystavenia ${T('BT-2')}.`,
  'BR-04': `Chýba kód typu faktúry ${T('BT-3')}.`,
  'BR-05': `Chýba mena faktúry ${T('BT-5')}.`,
  'BR-06': `Chýba obchodné meno predávajúceho ${T('BT-27')}.`,
  'BR-07': `Chýba obchodné meno kupujúceho ${T('BT-44')}.`,
  'BR-08': 'Chýba adresa predávajúceho (BG-5).',
  'BR-09': `Adresa predávajúceho musí obsahovať kód krajiny ${T('BT-40')}.`,
  'BR-10': 'Chýba adresa kupujúceho (BG-8).',
  'BR-11': `Adresa kupujúceho musí obsahovať kód krajiny ${T('BT-55')}.`,
  'BR-12': `Chýba súčet položiek bez DPH ${T('BT-106')}.`,
  'BR-13': `Chýba celková suma bez DPH ${T('BT-109')}.`,
  'BR-14': `Chýba celková suma s DPH ${T('BT-112')}.`,
  'BR-15': `Chýba suma na úhradu ${T('BT-115')}.`,
  'BR-16': 'Faktúra musí mať aspoň jednu položku (BG-25).',
  'BR-17': `Ak je príjemca platby iný ako predávajúci, musí byť uvedený jeho názov ${T('BT-59')}.`,
  'BR-18': `Ak má predávajúci daňového zástupcu, musí byť uvedený jeho názov ${T('BT-62')}.`,
  'BR-19': 'Ak má predávajúci daňového zástupcu, musí byť uvedená jeho adresa (BG-12).',
  'BR-20': `Adresa daňového zástupcu musí obsahovať kód krajiny ${T('BT-69')}.`,
  'BR-21': `Každá položka musí mať číslo riadku ${T('BT-126')}.`,
  'BR-22': `Každá položka musí mať fakturované množstvo ${T('BT-129')}.`,
  'BR-23': `Každá položka musí mať mernú jednotku ${T('BT-130')}.`,
  'BR-24': `Každá položka musí mať sumu bez DPH ${T('BT-131')}.`,
  'BR-25': `Každá položka musí mať názov ${T('BT-153')}.`,
  'BR-26': `Každá položka musí mať jednotkovú cenu bez DPH ${T('BT-146')}.`,
  'BR-27': `Jednotková cena bez DPH ${T('BT-146')} nesmie byť záporná. Zápornú sumu vyjadrite záporným množstvom.`,
  'BR-28': `Hrubá jednotková cena ${T('BT-148')} nesmie byť záporná.`,
  'BR-29': `Koniec fakturačného obdobia ${T('BT-74')} nesmie byť skôr ako jeho začiatok ${T('BT-73')}.`,
  'BR-30': `Koniec obdobia položky ${T('BT-135')} nesmie byť skôr ako jeho začiatok ${T('BT-134')}.`,
  'BR-31': `Každá zľava na úrovni dokladu musí mať sumu ${T('BT-92')}.`,
  'BR-32': `Každá zľava na úrovni dokladu musí mať kategóriu DPH ${T('BT-95')}.`,
  'BR-33': `Každá zľava na úrovni dokladu musí mať dôvod ${T('BT-97')} alebo kód dôvodu ${T('BT-98')}.`,
  'BR-36': `Každý poplatok na úrovni dokladu musí mať sumu ${T('BT-99')}.`,
  'BR-37': `Každý poplatok na úrovni dokladu musí mať kategóriu DPH ${T('BT-102')}.`,
  'BR-38': `Každý poplatok na úrovni dokladu musí mať dôvod ${T('BT-104')} alebo kód dôvodu ${T('BT-105')}.`,
  'BR-41': `Každá zľava na položke musí mať sumu ${T('BT-136')}.`,
  'BR-42': `Každá zľava na položke musí mať dôvod ${T('BT-139')} alebo kód dôvodu ${T('BT-140')}.`,
  'BR-43': `Každý poplatok na položke musí mať sumu ${T('BT-141')}.`,
  'BR-44': `Každý poplatok na položke musí mať dôvod ${T('BT-144')} alebo kód dôvodu ${T('BT-145')}.`,
  'BR-45': `Každý riadok rozpisu DPH musí mať základ dane ${T('BT-116')}.`,
  'BR-46': `Každý riadok rozpisu DPH musí mať sumu DPH ${T('BT-117')}.`,
  'BR-47': `Každý riadok rozpisu DPH musí mať kód kategórie DPH ${T('BT-118')}.`,
  'BR-48': `Každý riadok rozpisu DPH musí mať sadzbu ${T('BT-119')}, okrem plnenia, ktoré nepodlieha DPH (kategória O).`,
  'BR-49': `Platobné inštrukcie musia obsahovať kód spôsobu úhrady ${T('BT-81')}.`,
  'BR-50': `Pri platbe prevodom na účet musí byť uvedené číslo účtu ${T('BT-84')}.`,
  'BR-51': 'Faktúra nesmie obsahovať celé číslo platobnej karty – najviac prvých 6 a posledné 4 číslice (PCI DSS).',
  'BR-52': `Každá príloha musí mať referenciu ${T('BT-122')}.`,
  'BR-53': `Ak je uvedená mena účtovania DPH ${T('BT-6')}, musí byť uvedená aj DPH celkom v tejto mene ${T('BT-111')}.`,
  'BR-54': `Každý atribút položky musí mať názov ${T('BT-160')} aj hodnotu ${T('BT-161')}.`,
  'BR-55': `Každý odkaz na predchádzajúcu faktúru musí obsahovať jej číslo ${T('BT-25')}.`,
  'BR-56': `Daňový zástupca musí mať uvedené IČ DPH ${T('BT-63')}.`,
  'BR-57': `Adresa dodania musí obsahovať kód krajiny ${T('BT-80')}.`,
  'BR-61': `Pri SEPA prevode, domácom alebo zahraničnom prevode (kód 30, 58, 31, 42…) musí byť uvedené číslo účtu ${T('BT-84')}.`,
  'BR-62': `Elektronická adresa predávajúceho ${T('BT-34')} musí mať schému (atribút schemeID, pre SK DIČ je to 0245).`,
  'BR-63': `Elektronická adresa kupujúceho ${T('BT-49')} musí mať schému (atribút schemeID, pre SK DIČ je to 0245).`,
  'BR-64': `Štandardný identifikátor položky ${T('BT-157')} musí mať schému (napr. 0160 pre GTIN/EAN).`,
  'BR-65': `Klasifikačný kód položky ${T('BT-158')} musí mať schému (listID).`,
  'BR-CO-03': `Dátum vzniku daňovej povinnosti ${T('BT-7')} a jeho kód ${T('BT-8')} sa navzájom vylučujú – uveďte len jedno.`,
  'BR-CO-04': `Každá položka musí mať kategóriu DPH ${T('BT-151')}.`,
  'BR-CO-05': 'Kód dôvodu zľavy a textový dôvod zľavy musia vyjadrovať ten istý typ zľavy.',
  'BR-CO-06': 'Kód dôvodu poplatku a textový dôvod poplatku musia vyjadrovať ten istý typ poplatku.',
  'BR-CO-07': 'Kód dôvodu zľavy na položke a jej textový dôvod musia vyjadrovať ten istý typ zľavy.',
  'BR-CO-08': 'Kód dôvodu poplatku na položke a jeho textový dôvod musia vyjadrovať ten istý typ poplatku.',
  'BR-CO-09': 'IČ DPH predávajúceho, kupujúceho aj daňového zástupcu musí začínať kódom krajiny (napr. SK2020123456). Grécko môže použiť EL.',
  'BR-CO-10': `Súčet položiek bez DPH ${T('BT-106')} sa nerovná súčtu súm jednotlivých položiek ${T('BT-131')}.`,
  'BR-CO-11': `Súčet zliav na úrovni dokladu ${T('BT-107')} sa nerovná súčtu jednotlivých zliav ${T('BT-92')}.`,
  'BR-CO-12': `Súčet poplatkov na úrovni dokladu ${T('BT-108')} sa nerovná súčtu jednotlivých poplatkov ${T('BT-99')}.`,
  'BR-CO-13': `Celkom bez DPH ${T('BT-109')} musí byť súčet položiek − zľavy + poplatky na úrovni dokladu.`,
  'BR-CO-14': `DPH celkom ${T('BT-110')} sa nerovná súčtu DPH z rozpisu podľa kategórií ${T('BT-117')}.`,
  'BR-CO-15': `Celkom s DPH ${T('BT-112')} musí byť Celkom bez DPH ${T('BT-109')} + DPH celkom ${T('BT-110')}.`,
  'BR-CO-16': `Suma na úhradu ${T('BT-115')} musí byť Celkom s DPH − uhradené zálohy + zaokrúhlenie.`,
  'BR-CO-17': `DPH v kategórii ${T('BT-117')} musí byť základ dane × sadzba / 100, zaokrúhlené na 2 desatinné miesta (tolerancia ±1).`,
  'BR-CO-18': 'Faktúra musí obsahovať aspoň jeden riadok rozpisu DPH (BG-23).',
  'BR-CO-19': 'Ak je uvedené fakturačné obdobie (BG-14), musí mať začiatok, koniec alebo oboje.',
  'BR-CO-20': 'Ak je uvedené obdobie položky (BG-26), musí mať začiatok, koniec alebo oboje.',
  'BR-CO-21': 'Každá zľava na úrovni dokladu musí mať dôvod, kód dôvodu alebo oboje.',
  'BR-CO-22': 'Každý poplatok na úrovni dokladu musí mať dôvod, kód dôvodu alebo oboje.',
  'BR-CO-23': 'Každá zľava na položke musí mať dôvod, kód dôvodu alebo oboje.',
  'BR-CO-24': 'Každý poplatok na položke musí mať dôvod, kód dôvodu alebo oboje.',
  'BR-CO-25': `Ak je suma na úhradu kladná, musí byť uvedený dátum splatnosti ${T('BT-9')} alebo platobné podmienky ${T('BT-20')}.`,
  'BR-CO-26': `Predávajúci musí byť identifikovateľný: uveďte identifikátor ${T('BT-29')}, IČO ${T('BT-30')} alebo IČ DPH ${T('BT-31')}.`,
  'PEPPOL-EN16931-R001': `Chýba typ obchodného procesu ${T('BT-23')} (ProfileID).`,
  'PEPPOL-EN16931-R002': 'Faktúra môže mať najviac jednu poznámku na úrovni dokladu (viac len ak sú obe strany z Nemecka).',
  'PEPPOL-EN16931-R003': `Chýba referencia kupujúceho ${T('BT-10')} alebo číslo objednávky ${T('BT-13')}. Ak kupujúci nič nežiada, stačí uviesť napr. číslo faktúry.`,
  'PEPPOL-EN16931-R004': 'Identifikátor špecifikácie (CustomizationID) musí byť urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0.',
  'PEPPOL-EN16931-R005': `Mena účtovania DPH ${T('BT-6')} sa musí líšiť od meny faktúry, ak je uvedená.`,
  'PEPPOL-EN16931-R006': 'Na úrovni dokladu môže byť najviac jeden fakturovaný objekt.',
  'PEPPOL-EN16931-R007': 'Typ obchodného procesu (ProfileID) musí mať tvar urn:fdc:peppol.eu:2017:poacc:billing:NN:1.0 (bežne 01).',
  'PEPPOL-EN16931-R008': 'Dokument nesmie obsahovať prázdne elementy. Nevyplnené polia úplne vynechajte.',
  'PEPPOL-EN16931-R010': `Chýba elektronická adresa kupujúceho ${T('BT-49')}. Pre slovenskú firmu: schéma 0245 + DIČ.`,
  'PEPPOL-EN16931-R020': `Chýba elektronická adresa predávajúceho ${T('BT-34')}. Pre slovenskú firmu: schéma 0245 + DIČ.`,
  'PEPPOL-EN16931-R040': 'Suma zľavy/poplatku musí byť základ × percento / 100 (tolerancia 0,02).',
  'PEPPOL-EN16931-R041': 'Ak je uvedené percento zľavy/poplatku, musí byť uvedený aj základ.',
  'PEPPOL-EN16931-R042': 'Ak je uvedený základ zľavy/poplatku, musí byť uvedené aj percento.',
  'PEPPOL-EN16931-R043': 'ChargeIndicator musí byť presne „true“ (poplatok) alebo „false“ (zľava).',
  'PEPPOL-EN16931-R044': 'Na úrovni ceny je povolená iba zľava (ChargeIndicator = false).',
  'PEPPOL-EN16931-R046': `Jednotková cena bez DPH ${T('BT-146')} musí byť hrubá cena ${T('BT-148')} − zľava z ceny ${T('BT-147')}.`,
  'PEPPOL-EN16931-R051': `Všetky sumy (atribút currencyID) musia byť v mene faktúry ${T('BT-5')} – okrem DPH v mene účtovania ${T('BT-111')}.`,
  'PEPPOL-EN16931-R053': 'Faktúra musí mať práve jeden TaxTotal s rozpisom DPH (TaxSubtotal).',
  'PEPPOL-EN16931-R054': 'Ak je uvedená mena účtovania DPH, musí byť uvedený práve jeden TaxTotal bez rozpisu (suma DPH v tejto mene).',
  'PEPPOL-EN16931-R055': 'DPH celkom a DPH v mene účtovania musia mať rovnaké znamienko.',
  'PEPPOL-EN16931-R061': `Pri inkase (kód 49 alebo 59) musí byť uvedená referencia mandátu ${T('BT-89')}.`,
  'PEPPOL-EN16931-R080': 'Na úrovni dokladu môže byť najviac jedna referencia projektu.',
  'PEPPOL-EN16931-R100': 'Na položke môže byť najviac jeden fakturovaný objekt.',
  'PEPPOL-EN16931-R101': 'Odkaz na dokument na položke je povolený iba pre fakturovaný objekt (DocumentTypeCode 130).',
  'PEPPOL-EN16931-R110': 'Začiatok obdobia položky musí byť v rámci fakturačného obdobia.',
  'PEPPOL-EN16931-R111': 'Koniec obdobia položky musí byť v rámci fakturačného obdobia.',
  'PEPPOL-EN16931-R120': `Suma položky ${T('BT-131')} musí byť množstvo × (cena / základné množstvo) + poplatky − zľavy na položke (tolerancia 0,02).`,
  'PEPPOL-EN16931-R121': `Základné množstvo ceny ${T('BT-149')} musí byť kladné číslo.`,
  'PEPPOL-EN16931-R130': 'Jednotka základného množstva ceny musí byť rovnaká ako jednotka fakturovaného množstva.',
  'PEPPOL-EN16931-P0100': 'Kód typu faktúry nie je v profile Peppol BIS povolený (bežne 380; pre opravnú faktúru 384).',
  'PEPPOL-EN16931-P0101': 'Kód typu dobropisu nie je v profile Peppol BIS povolený (bežne 381).',
  'PEPPOL-EN16931-P0112': 'Typy faktúry 326 a 384 sú povolené len ak sú kupujúci aj predávajúci z Nemecka.',
  'PEPPOL-EN16931-F001': 'Dátum musí mať tvar RRRR-MM-DD.',
  'PEPPOL-EN16931-CL001': 'MIME typ prílohy nie je povolený (povolené: PDF, PNG, JPEG, CSV, XLSX, ODS).',
  'PEPPOL-EN16931-CL002': 'Kód dôvodu zľavy musí byť z číselníka UNCL 5189.',
  'PEPPOL-EN16931-CL003': 'Kód dôvodu poplatku musí byť z číselníka UNCL 7161.',
  'PEPPOL-EN16931-CL006': 'Kód opisu fakturačného obdobia musí byť z číselníka UNCL 2005.',
  'PEPPOL-EN16931-CL007': 'Kód meny musí byť z číselníka ISO 4217.',
  'PEPPOL-EN16931-CL008': 'Schéma elektronickej adresy musí byť z číselníka EAS (pre SK DIČ: 0245).',
  'PEPPOL-COMMON-R040': 'GLN nemá platný formát podľa GS1 (kontrolná číslica).',
  'PEPPOL-COMMON-R043': 'Belgické číslo podniku nemá správny formát.',
  'UBL-SR-43': 'Atribút schemeID a kódy 130/50 sú v prílohách vyhradené pre fakturovaný objekt a projekt – bežná príloha ich nemá mať.',
  'UBL-SR-44': 'Faktúra môže mať len jednu platobnú referenciu (PaymentID), môže sa však opakovať vo viacerých spôsoboch platby.',
  'UBL-SR-47': 'Ak je viac spôsobov platby, musia mať rovnaký kód.',
  'UBL-SR-48': 'Každá položka musí mať práve jednu kategóriu DPH (ClassifiedTaxCategory).',
  'UBL-SR-53': 'Pri PartyTaxScheme musí byť uvedené aj IČ DPH (CompanyID).',
  'UBL-DT-01': 'Sumy môžu mať najviac 2 desatinné miesta.',
  'UBL-DT-06': 'Vložená príloha musí mať atribút mimeCode.',
  'UBL-DT-07': 'Vložená príloha musí mať atribút filename.',
};

const CATEGORY = {
  S: 'Štandardná sadzba (S)',
  Z: 'Nulová sadzba (Z)',
  E: 'Oslobodené od DPH (E)',
  AE: 'Prenesenie daňovej povinnosti (AE)',
  IC: 'Dodanie v rámci EÚ (K)',
  G: 'Vývoz mimo EÚ (G)',
  O: 'Nepodlieha DPH (O)',
  AF: 'IGIC – Kanárske ostrovy (L)',
  AG: 'IPSI – Ceuta a Melilla (M)',
};

function vatFamily(fam, n) {
  const c = `„${CATEGORY[fam]}“`;
  const zeroRate = ['Z', 'E', 'AE', 'IC', 'G'].includes(fam);
  switch (n) {
    case 1:
      return fam === 'O'
        ? `Faktúra s plnením v kategórii ${c} musí mať v rozpise DPH práve jeden riadok s touto kategóriou.`
        : `Faktúra s položkou, zľavou alebo poplatkom v kategórii ${c} musí mať v rozpise DPH (BG-23) aspoň jeden riadok s touto kategóriou.`;
    case 2:
    case 3:
    case 4: {
      const what = n === 2 ? 'položku' : n === 3 ? 'zľavu na úrovni dokladu' : 'poplatok na úrovni dokladu';
      if (fam === 'O') return `Faktúra, ktorá má ${what} v kategórii ${c}, nesmie obsahovať IČ DPH predávajúceho, daňového zástupcu ani kupujúceho.`;
      if (fam === 'AE') return `Faktúra, ktorá má ${what} v kategórii ${c}, musí obsahovať IČ DPH predávajúceho (alebo daňového zástupcu) a IČ DPH alebo iné identifikačné číslo kupujúceho.`;
      if (fam === 'IC') return `Faktúra, ktorá má ${what} v kategórii ${c}, musí obsahovať IČ DPH predávajúceho (alebo daňového zástupcu) aj IČ DPH kupujúceho.`;
      return `Faktúra, ktorá má ${what} v kategórii ${c}, musí obsahovať IČ DPH ${T('BT-31')}, daňové registračné číslo ${T('BT-32')} alebo IČ DPH daňového zástupcu ${T('BT-63')}.`;
    }
    case 5:
    case 6:
    case 7: {
      const what = n === 5 ? 'položky (BT-152)' : n === 6 ? 'zľavy (BT-96)' : 'poplatku (BT-103)';
      if (fam === 'O') return `Pri kategórii ${c} sa sadzba DPH ${what} neuvádza.`;
      if (fam === 'S' || fam === 'AF' || fam === 'AG') return `Pri kategórii ${c} musí byť sadzba DPH ${what} väčšia ako 0 (na Slovensku 23 %, 19 % alebo 5 %).`;
      return `Pri kategórii ${c} musí byť sadzba DPH ${what} 0.`;
    }
    case 8:
      return `Základ dane ${T('BT-116')} pre kategóriu ${c}${fam === 'S' || fam === 'AF' || fam === 'AG' ? ' a danú sadzbu' : ''} sa musí rovnať súčtu súm položiek − zľavy + poplatky v tejto kategórii.`;
    case 9:
      if (fam === 'S' || fam === 'AF' || fam === 'AG') return `DPH v kategórii ${c} musí byť základ dane × sadzba (zaokrúhlené na 2 desatinné miesta).`;
      return `DPH v kategórii ${c} musí byť 0.`;
    case 10:
      if (fam === 'S' || fam === 'Z' || fam === 'AF' || fam === 'AG') return `Riadok rozpisu DPH v kategórii ${c} nesmie obsahovať dôvod oslobodenia (BT-120) ani jeho kód (BT-121).`;
      return `Riadok rozpisu DPH v kategórii ${c} musí obsahovať dôvod oslobodenia (BT-120) alebo jeho kód (BT-121) (napr. VATEX-EU-${fam === 'IC' ? 'IC' : fam === 'G' ? 'G' : fam === 'AE' ? 'AE' : fam === 'O' ? 'O' : '…'}).`;
    case 11:
      if (fam === 'IC') return `Pri dodaní v rámci EÚ musí byť uvedený dátum dodania ${T('BT-72')} alebo fakturačné obdobie (BG-14).`;
      if (fam === 'O') return `Faktúra s rozpisom DPH v kategórii ${c} nesmie obsahovať iné kategórie DPH.`;
      return undefined;
    case 12:
      if (fam === 'IC') return `Pri dodaní v rámci EÚ musí byť uvedený kód krajiny dodania ${T('BT-80')}.`;
      if (fam === 'O') return `Faktúra s kategóriou ${c} nesmie obsahovať položky v inej kategórii DPH.`;
      return undefined;
    case 13:
      if (fam === 'O') return `Faktúra s kategóriou ${c} nesmie obsahovať zľavy na úrovni dokladu v inej kategórii DPH.`;
      return undefined;
    case 14:
      if (fam === 'O') return `Faktúra s kategóriou ${c} nesmie obsahovať poplatky na úrovni dokladu v inej kategórii DPH.`;
      return undefined;
    default:
      return undefined;
  }
}

const CODELISTS = [
  [/UNTDID 1001/, 'Kód typu dokladu musí byť z číselníka UNTDID 1001 (faktúra 380, dobropis 381, …).'],
  [/currencyID|Invoice currency|Tax currency|4217/, 'Kód meny musí byť z číselníka ISO 4217 (napr. EUR).'],
  [/UNTDID 2005/, 'Kód dátumu vzniku daňovej povinnosti musí byť z číselníka UNTDID 2005.'],
  [/UNTDID 1153/, 'Schéma identifikátora objektu musí byť z číselníka UNTDID 1153.'],
  [/ISO 6523 ICD/, 'Schéma identifikátora musí byť z číselníka ISO 6523 ICD.'],
  [/UNTDID 7143/, 'Schéma klasifikácie položky musí byť z číselníka UNTDID 7143.'],
  [/3166/, 'Kód krajiny musí byť z číselníka ISO 3166-1 (napr. SK, CZ).'],
  [/UNCL4461/, 'Kód spôsobu úhrady musí byť z číselníka UNCL 4461 (napr. 30 prevod, 58 SEPA prevod).'],
  [/UNCL5305/, 'Kategória DPH musí byť z číselníka UNCL 5305 (S, Z, E, AE, K, G, O, L, M).'],
  [/UNCL 5189/, 'Kód dôvodu zľavy musí byť z číselníka UNCL 5189.'],
  [/UNCL 7161/, 'Kód dôvodu poplatku musí byť z číselníka UNCL 7161.'],
  [/VATEX/, 'Kód dôvodu oslobodenia musí byť z číselníka CEF VATEX.'],
  [/Recommendation 20/, 'Merná jednotka musí byť z číselníka UN/ECE Rec. 20/21 (napr. C62 kus, HUR hodina, KGM kg).'],
  [/Mime|MIME/, 'MIME typ prílohy nie je povolený.'],
  [/EAS/, 'Schéma elektronickej adresy musí byť z číselníka CEF EAS (pre SK DIČ: 0245).'],
  [/UNCL4451/, 'Kód predmetu poznámky musí byť z číselníka UNCL 4451.'],
];

/**
 * Slovak explanation for a failed rule.
 * @param {string} id rule id, e.g. "BR-CO-15"
 * @param {string} [message] official English message (used by templates)
 */
export function translateRule(id, message = '') {
  if (!id) return undefined;
  if (RULES_SK[id]) return RULES_SK[id];
  let m;
  if ((m = /^BR-DEC-\d+$/.exec(id))) {
    const bt = /\((BT-\d+)\)/.exec(message);
    return bt ? `${term(bt[1])} môže mať najviac 2 desatinné miesta.` : 'Suma môže mať najviac 2 desatinné miesta.';
  }
  if ((m = /^BR-(S|Z|E|AE|IC|G|O|AF|AG)-(\d+)$/.exec(id))) return vatFamily(m[1], Number(m[2]));
  if (/^BR-CL-\d+$/.test(id)) {
    for (const [re, sk] of CODELISTS) if (re.test(message)) return sk;
    return undefined;
  }
  if (/^UBL-SR-\d+$/.test(id) && /maximum once|maximum twice|only have one/.test(message)) {
    const what = message.replace(/^\[[^\]]+\]\s*-\s*/, '').replace(/ shall occur maximum (once|twice).*$/, '').replace(/^An? /, '');
    return `Element „${what}“ sa smie vyskytnúť najviac ${/twice/.test(message) ? 'dvakrát' : 'raz'}.`;
  }
  if (/^UBL-CR-\d+$/.test(id)) {
    const what = message.replace(/^\[[^\]]+\]\s*-\s*A UBL invoice should not include (the )?/, '');
    return `Element „${what}“ nie je súčasťou EN 16931 – príjemca ho ignoruje. Odporúčame ho vynechať.`;
  }
  if (/^(CII-SR|CII-DT|UBL-DT)-\d+$/.test(id) && /should not be present/.test(message)) {
    const what = message.replace(/^\[[^\]]+\]\s*-\s*/, '').replace(/ (attribute )?should not be present.*$/, '');
    return `„${what}“ by nemal byť v e-faktúre uvedený (nie je súčasťou EN 16931).`;
  }
  if (/^CII-SR-\d+$/.test(id) && /maximum once|Only one/.test(message)) {
    return `Element sa smie vyskytnúť najviac raz: ${message.replace(/^\[[^\]]+\]\s*-\s*/, '')}`;
  }
  return undefined;
}
