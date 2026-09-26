# Revízor – obchodný plán a podklady na predaj

Dokument je pracovný podklad. Ceny a odhady sú hypotézy, ktoré treba overiť prvými rozhovormi so zákazníkmi.

## 1. Situácia na trhu (stav k 26. 9. 2026)

- Od **1. 1. 2027** musia platitelia DPH na Slovensku pri tuzemských B2B plneniach vystavovať a prijímať faktúry výhradne elektronicky. Faktúry prijímajú všetky zdaniteľné osoby. Právny základ je zákon č. 385/2025 Z. z. Formát: EN 16931 / Peppol BIS 3.0. Prenos zabezpečuje certifikovaný „digitálny poštár“ (sieť Peppol, identifikátor `0245:DIČ`). Prechodné obdobie trvá do 30. 6. 2030. [Banqup](https://www.banqup.com/resources/blog/slovakia-s-next-step-a-5-corner-model-for-e-invoicing-in-2027), [TPA](https://www.tpa-group.sk/news/e-faktura-slovensko/), [EY](https://www.ey.com/sk_sk/services/tax/ey-global-tax-e-invoicing-solution-sk/povinna-elektronicka-fakturacia-od-roku-2027)
- Register Finančnej správy eviduje desiatky certifikovaných poštárov (v septembri 2026 okolo 70) a počet rastie. [digitalnipostari.sk](https://www.digitalnipostari.sk/zoznam-postarov), [KPMG](https://www.danovky.sk/sk/financna-sprava-spristupnila-zoznam-digitalnych-postarov)
- Webových validátorov je na trhu viac. Takmer všetky bežia na serveri, teda faktúra sa nahráva na cudzí server.

**Záver:** Konkurovať poštárom ani ďalším bezplatným online validátorom nemá zmysel. Revízor sa predáva ako **technológia a nástroj pre tých, ktorí e-faktúry vyrábajú, prijímajú alebo kontrolujú vo veľkom**.

## 2. Čo je unikátne (argumenty do rozhovoru)

1. **Oficiálne pravidlá bez servera.** 1 138 pravidiel CEN + Peppol beží v prehliadači alebo v Node.js. Faktúra neopúšťa počítač, čo pomáha s GDPR a obchodným tajomstvom.
2. **Overená zhoda s oficiálnym validátorom.** Na tisíckach testovacích faktúr sa výsledky zhodujú pravidlo po pravidle s referenčným Saxon/Schematron. Parity report je súčasťou CI a dá sa ukázať zákazníkovi.
3. **Chyby po slovensky.** Vysvetlenie, názov poľa (BT-xx) a presný riadok v XML. Účtovníčka rozumie, čo má opraviť.
4. **PAY by square priamo z e-faktúry.** Prijaté XML sa zobrazí ako faktúra s QR kódom, ktorý stačí naskenovať v bankovej aplikácii.
5. **Slovenské kontroly navyše.** Neplatné IČ DPH, zlý tvar Peppol ID, neplatný IBAN, stará sadzba DPH 20 %. Oficiálne pravidlá tieto chyby nezachytia.
6. **Jeden súbor, nulové prevádzkové náklady.** Žiadny server ani databáza. Aplikácia sa dá dodať ako HTML súbor, na vlastnej doméne alebo vložená do iného produktu.
7. **Nulové závislosti SDK.** Vlastný XML parser, XPath 2.0, Schematron, QR aj LZMA. Žiadne licenčné ani bezpečnostné riziká z cudzích balíkov.

## 3. Produkty a ceny (hypotézy)

| Produkt | Pre koho | Návrh ceny |
|---|---|---|
| **Revízor SDK – licencia** | softvérové firmy, poštári, ERP/fakturačné systémy, e-shop platformy | 1 900 € jednorazovo za produkt + 490 €/rok aktualizácie pravidiel a podpora |
| **Revízor SDK – OEM / white-label** | poštári a ERP, ktorí chcú validáciu a vizualizáciu pod vlastnou značkou | od 4 900 € + 990 €/rok |
| **Revízor pre kancelárie** (white-label web na doméne zákazníka) | účtovné kancelárie, daňoví poradcovia, audítori | 390 € nastavenie + 29 €/mesiac |
| **Balík „Pripravenosť na e-faktúru 2027“** | firmy s vlastným fakturačným systémom alebo exportom z Excelu | 290–990 € (kontrola ich XML, report chýb, odporúčania) |
| **Verejná bezplatná verzia** | všetci | 0 € – zdroj kontaktov (lead magnet), odkaz „Potrebujete automatizáciu? Ozvite sa.“ |

Poznámka: Ak predávate aj implementácie ERP (napr. Odoo je certifikovaný digitálny poštár), bezplatná verzia Revízora slúži ako vstupná brána k väčším zákazkam.

## 4. Kto kúpi – zoznam cieľov

1. **Digitálni poštári** – oficiálny zoznam na portáli Finančnej správy (VPDS). Menší poskytovatelia potrebujú kvalitnú vizualizáciu a validáciu rýchlo.
2. **Tvorcovia fakturačného a účtovného softvéru** – menší a regionálni hráči, vertikálne systémy (autoservisy, stavebníctvo, zdravotníctvo, ubytovanie).
3. **E-shop platformy a moduly** (WooCommerce, Shoptet, PrestaShop, vlastné riešenia) – potrebujú generovať platné UBL.
4. **Účtovné kancelárie** – od januára budú dostávať XML od klientov. Hromadná kontrola a export súčtov DPH šetria čas.
5. **Audítori a daňoví poradcovia** – kontrola archívov e-faktúr, súčty DPH, nezávislé overenie.
6. **IT integrátori** (Odoo, SAP Business One, Helios, Microsoft Dynamics) – validácia v projektoch, testovanie exportov.
7. **Veľké firmy s vlastným ERP** – interné IT potrebuje testovať vlastné generátory XML pred spustením.

## 5. Demo za 5 minút

1. Otvorte `dist/revizor.html`. Zobrazí sa vzorová faktúra s chybami a pečiatka **NEPLATNÁ**.
2. Kliknite na chybu **BR-CO-15**. XML sa posunie na riadok s chybou.
3. Ukážte slovenské kontroly: stará sadzba 20 %, neplatný IBAN, variabilný symbol.
4. Kliknite na **Platná faktúra**. Ukážte PAY by square a naskenujte QR telefónom (bankovou aplikáciou).
5. Záložka **Vystaviť faktúru**: zmeňte cenu. Pečiatka a náhľad sa prepočítajú naživo.
6. Záložka **Hromadná kontrola**: nahrajte 3 vzorky naraz a ukážte export CSV.
7. Záver: „Toto všetko beží bez servera. Rovnaký engine vložíme do vášho produktu.“

## 6. Šablóny oslovenia

### E-mail – softvérová firma / poštár

> **Predmet:** Validácia e-faktúr EN 16931 priamo vo vašom produkte – bez servera
>
> Dobrý deň, pán/pani [meno],
>
> od januára budú vaši zákazníci posielať a prijímať e-faktúry Peppol BIS 3.0. Vyvinuli sme knižnicu Revízor, ktorá kontroluje e-faktúry oficiálnymi pravidlami CEN a OpenPeppol priamo v prehliadači alebo v Node.js. Chyby vysvetľuje po slovensky a prijatú faktúru zobrazí s QR kódom PAY by square.
>
> Výsledky sa zhodujú s oficiálnym validátorom pravidlo po pravidle. Report z testov vám radi pošleme. Integrácia trvá zvyčajne jeden až dva dni.
>
> Môžem vám ukázať 15-minútové demo tento alebo budúci týždeň?
>
> S pozdravom, [meno, telefón]

### E-mail – účtovná kancelária

> **Predmet:** Od januára vám klienti pošlú XML namiesto PDF
>
> Dobrý deň,
>
> od 1. 1. 2027 budú faktúry vašich klientov prichádzať ako XML e-faktúry. Pripravili sme nástroj, ktorý stovky takých faktúr naraz skontroluje, zobrazí v čitateľnej podobe a spočíta základ dane a DPH do Excelu. Všetko beží vo vašom počítači, dáta klientov nikam neodchádzajú.
>
> Nástroj môžeme nasadiť pod menom vašej kancelárie, klienti ho potom používajú ako vašu službu.
>
> Môžem vám ho ukázať online za 10 minút?

### LinkedIn správa (do 300 znakov)

> Dobrý deň, venujete sa e-fakturácii 2027. Máme validátor e-faktúr Peppol, ktorý beží bez servera, vysvetľuje chyby po slovensky a zhoduje sa s oficiálnym validátorom na 100 %. Dá sa vložiť do vášho produktu. Dá sa to ukázať za 10 minút?

## 7. Námietky a odpovede

| Námietka | Odpoveď |
|---|---|
| „Validátor je zadarmo na internete.“ | Áno, ako webová služba pre jednotlivé súbory. Revízor je knižnica do vášho produktu, bez servera a s kontrolami pre Slovensko. Zákazníkovi sa neukazuje cudzí web. |
| „Oficiálny validátor si vieme spustiť sami v Jave.“ | Dá sa to, ale potrebujete Java server, údržbu a slovenské texty. Revízor beží v prehliadači, v Node.js aj offline a má zhodné výsledky. |
| „Čo keď sa pravidlá zmenia?“ | Pravidlá sú dáta. Nová verzia OpenPeppol sa vymení v priebehu hodín a automatický test overí zhodu. Aktualizácie sú súčasťou ročného poplatku. |
| „Ste malá firma, čo ak skončíte?“ | Súčasťou licencie môže byť úschova zdrojového kódu (escrow) alebo zdrojový kód pre zákazníka. |
| „Posiela to faktúry?“ | Nie, Revízor nie je poštár. Dopĺňa poštára alebo ERP o kontrolu, zobrazenie a tvorbu faktúr. |

## 8. Plán na 30 dní

| Týždeň | Aktivita | Cieľ |
|---|---|---|
| 1 | Nasadiť bezplatnú verziu na vlastnú doménu, doplniť kontakt (`brand.json`), stránka „cenník“ | web funguje, prvé návštevy |
| 1 | Zoznam 40 poštárov a 30 softvérových firiem (meno rozhodovateľa, e-mail, LinkedIn) | 70 kontaktov |
| 2 | 10 oslovení denne (e-mail + LinkedIn), follow-up po 3 dňoch | 10 dem |
| 2–3 | Demá, ponuky, pilot zadarmo na 30 dní pre prvých dvoch | 2 piloty |
| 3 | 20 účtovných kancelárií v okolí (osobne alebo telefonicky) | 5 dem, 1 white-label |
| 4 | Prvé faktúry, referencie, prípadová štúdia | 1–3 platiaci zákazníci |

Metriky: počet oslovení → dem → pilotov → zmlúv. Ak po 50 osloveniach nie je ani 5 dem, treba zmeniť segment alebo správu, nie produkt.

## 9. Riziká a čo treba dotiahnuť pred predajom

- **Právne:** doplniť držiteľa práv a EULA ([LICENSE.md](LICENSE.md)). Nechať overiť použitie pravidiel pod EUPL 1.2 v proprietárnom produkte (súbory sa distribuujú bez úprav ako dáta, viď [NOTICE.md](NOTICE.md)).
- **Ochranná známka:** nepoužívať „Peppol“ v názve produktu ani domény.
- **PAY by square:** otestovať QR kódy v aplikáciách hlavných slovenských bánk (Slovenská sporiteľňa, Tatra banka, VÚB, ČSOB, 365.bank).
- **XSD kontrola** v prehliadači zatiaľ chýba (zlé poradie elementov odhalí až príjemca). Pre veľkých zákazníkov je to prvá položka roadmapy.
- **Údržba:** pravidlá OpenPeppol sa menia dvakrát ročne. Počítajte s niekoľkými hodinami práce na aktualizáciu a test.
- **Žiadne právne ani daňové poradenstvo:** nástroj overuje technickú správnosť dokladu, nie správnosť zdanenia.
