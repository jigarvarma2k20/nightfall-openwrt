#!/bin/sh
# Blocks releasing a tag without a matching top CHANGELOG section.
set -eu
TAG=${1:-${GITHUB_REF_NAME:-}}
[ -n "$TAG" ] || { echo "ERROR: no release tag given" >&2; exit 1; }
VERSION=${TAG#v}
printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' || {
  echo "ERROR: expected a vMAJOR.MINOR.PATCH[-prerelease] tag, got: $TAG" >&2
  exit 1
}
FIRST=$(sed -n '1p' CHANGELOG.md)
case "$FIRST" in
  "## v$VERSION · "*) ;;
  *) echo "ERROR: the top section of CHANGELOG.md must start with ## v$VERSION" >&2; exit 1 ;;
esac
COUNT=$(awk 'BEGIN{n=0;active=0} /^## /{if(active)exit; if($0 ~ /^## v[0-9.]+(-[0-9A-Za-z.-]+)? · /)active=1; next} active && /^- /{n++} END{print n}' CHANGELOG.md)
[ "$COUNT" -ge 1 ] || { echo "ERROR: section v$VERSION has no change entries" >&2; exit 1; }
echo "CHANGELOG for $TAG checked: $COUNT entry(ies)."
