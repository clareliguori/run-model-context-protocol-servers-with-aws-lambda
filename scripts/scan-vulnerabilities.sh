#!/bin/bash
# Scan for critical (CVSS >= 9.0) vulnerabilities using osv-scanner
set -euo pipefail

OSV_VERSION="2.3.5"
MIN_SEVERITY=9.0

# Download osv-scanner if not present
if [ ! -f ./osv-scanner ]; then
  curl -sSfL "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_amd64" -o osv-scanner
  chmod +x osv-scanner
fi

# Run osv-scanner
EXIT_CODE=0
./osv-scanner scan source --config=./osv-scanner.toml --format=json "$@" 2>/dev/null > results.json || EXIT_CODE=$?

# Exit code 0 = no vulns, 1 = vulns found, 127+ = error
if [ "$EXIT_CODE" -ne 0 ] && [ "$EXIT_CODE" -ne 1 ]; then
  echo "osv-scanner failed with exit code $EXIT_CODE"
  exit $EXIT_CODE
fi

# Filter for critical vulnerabilities
CRITICAL=$(jq '[.results[]?.packages[]?.groups[]? | select(.max_severity != "" and (.max_severity | tonumber) >= '"$MIN_SEVERITY"')] | length' results.json)

if [ "$CRITICAL" -gt 0 ]; then
  echo "Critical vulnerabilities found:"
  jq -r '.results[]? | .source.path as $src | .packages[]? | .package as $pkg | .groups[]? | select(.max_severity != "" and (.max_severity | tonumber) >= '"$MIN_SEVERITY"') | "  - \($pkg.name)@\($pkg.version): \(.ids[0]) (CVSS \(.max_severity))"' results.json
  rm -f results.json
  exit 1
fi

echo "No critical vulnerabilities found"
rm -f results.json
