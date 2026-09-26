# Súčasti tretích strán

## Oficiálne validačné pravidlá (`rules/*.sch`)

- `CEN-EN16931-UBL.sch`, `CEN-EN16931-CII.sch` – validačné artefakty EN 16931 (verzia 1.3.15), © CEN/TC 434 a Európska komisia (projekt ConnectingEurope eInvoicing-EN16931).
- `PEPPOL-EN16931-UBL.sch`, `PEPPOL-EN16931-CII.sch` – Peppol BIS Billing 3.0.20, © OpenPeppol AISBL, zdroj [github.com/OpenPEPPOL/peppol-bis-invoice-3](https://github.com/OpenPEPPOL/peppol-bis-invoice-3).

Súbory sú licencované pod **European Union Public Licence (EUPL) v1.2** a distribuujú sa **bez úprav** vrátane pôvodných hlavičiek. Revízor ich načítava ako dáta pri behu programu. Text licencie: <https://spdx.org/licenses/EUPL-1.2.html>.

## Formát PAY by square

Kódovanie platobných údajov zodpovedá štandardu PAY by square Slovenskej bankovej asociácie. Rozloženie polí bolo overené voči open-source implementácii [xseman/bysquare](https://github.com/xseman/bysquare) (Apache-2.0), ktorá sa používa iba v testoch (devDependency), nie v distribuovanom kóde.

## Písma

Aplikácia načítava z Google Fonts písma Bricolage Grotesque, IBM Plex Sans a IBM Plex Mono (SIL Open Font License 1.1). Bez internetu sa použijú systémové písma.

## Nástroje na vývoj (nie sú súčasťou distribúcie)

esbuild (MIT), Playwright (Apache-2.0), jsQR (Apache-2.0), bysquare (Apache-2.0). Referenčný validátor v `scripts/reference/` sťahuje Saxon-HE (MPL-2.0) a SchXslt (MIT).

## Ochranné známky

„Peppol“ je ochranná známka OpenPeppol AISBL. Revízor nie je produktom OpenPeppol ani ním nie je certifikovaný. Pojem sa používa iba na označenie formátu, s ktorým nástroj pracuje.
