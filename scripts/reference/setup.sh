#!/usr/bin/env bash
# Builds the reference validator used by scripts/parity.mjs:
# Saxon-HE (Java) + SchXslt compile the same official .sch files from rules/
# into XSLT. Requires java and curl. Output directory: $1 (default .reference)
set -euo pipefail
OUT="${1:-.reference}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT"
cd "$OUT"
MVN=https://repo1.maven.org/maven2
[ -f saxon-he.jar ] || curl -sSfL -o saxon-he.jar "$MVN/net/sf/saxon/Saxon-HE/12.5/Saxon-HE-12.5.jar"
[ -f xmlresolver.jar ] || curl -sSfL -o xmlresolver.jar "$MVN/org/xmlresolver/xmlresolver/5.2.2/xmlresolver-5.2.2.jar"
[ -f schxslt.jar ] || curl -sSfL -o schxslt.jar "$MVN/name/dmaus/schxslt/schxslt/1.10.1/schxslt-1.10.1.jar"
mkdir -p schx && (cd schx && unzip -qo ../schxslt.jar)
for n in CEN-EN16931-UBL PEPPOL-EN16931-UBL CEN-EN16931-CII PEPPOL-EN16931-CII; do
  java -cp saxon-he.jar:xmlresolver.jar net.sf.saxon.Transform \
    -s:"$ROOT/rules/$n.sch" -xsl:schx/xslt/2.0/pipeline-for-svrl.xsl -o:"ref-$n.xslt"
done
echo "Reference ready in $OUT. Run: node scripts/parity.mjs --ref $OUT --corpus samples --mutants 300"
