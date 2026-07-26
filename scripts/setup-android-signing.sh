#!/usr/bin/env bash
#
# One-command Android release signing setup.
#
# Creates the upload keystore, then registers the four secrets the mobile
# workflow expects. Run it on your own machine: the private key must stay
# under your control and must never be committed or pasted into a chat.
#
#   ./scripts/setup-android-signing.sh
#
set -euo pipefail

KEYSTORE="${KEYSTORE_PATH:-$HOME/umbra-vale-release.keystore}"
ALIAS="${KEY_ALIAS:-umbravale}"
REPO="${GITHUB_REPO:-ALNassrME/Snake}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

command -v keytool >/dev/null || fail "keytool not found — install a JDK (e.g. Temurin 21) and retry."

bold "Umbra Vale — Android release signing"
echo

# ---------------------------------------------------------------- keystore
if [ -f "$KEYSTORE" ]; then
  warn "Keystore already exists: $KEYSTORE"
  warn "Reusing it. Never regenerate a keystore for an app already on Google"
  warn "Play — a new key makes future updates impossible under that listing."
  echo
  printf 'Keystore password: '; read -rs STORE_PASS; echo
  KEY_PASS="$STORE_PASS"
else
  echo "Creating a new upload keystore at:"
  echo "  $KEYSTORE"
  echo
  warn "BACK THIS FILE UP. Losing it means you can never publish an update to"
  warn "the same Google Play listing again. Store it somewhere durable and"
  warn "private (a password manager or encrypted backup)."
  echo
  printf 'Choose a keystore password (min 6 chars): '; read -rs STORE_PASS; echo
  printf 'Confirm password: '; read -rs STORE_PASS2; echo
  [ "$STORE_PASS" = "$STORE_PASS2" ] || fail "Passwords do not match."
  [ ${#STORE_PASS} -ge 6 ] || fail "Password must be at least 6 characters."
  KEY_PASS="$STORE_PASS"

  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -dname "CN=Umbra Vale, OU=Games, O=Umbra Vale, L=, ST=, C=SA" \
    >/dev/null 2>&1
  chmod 600 "$KEYSTORE"
  echo "Keystore created."
fi

# Fail fast if the password is wrong, rather than at build time in CI.
keytool -list -keystore "$KEYSTORE" -storepass "$STORE_PASS" -alias "$ALIAS" \
  >/dev/null 2>&1 || fail "Could not open the keystore with that password/alias."
echo "Keystore verified (alias: $ALIAS)."
echo

# --------------------------------------------------------------- secrets
B64="$(base64 -w0 "$KEYSTORE" 2>/dev/null || base64 -i "$KEYSTORE" | tr -d '\n')"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  bold "Uploading secrets to $REPO"
  printf '%s' "$B64"         | gh secret set ANDROID_KEYSTORE_BASE64   --repo "$REPO"
  printf '%s' "$STORE_PASS"  | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
  printf '%s' "$ALIAS"       | gh secret set ANDROID_KEY_ALIAS         --repo "$REPO"
  printf '%s' "$KEY_PASS"    | gh secret set ANDROID_KEY_PASSWORD      --repo "$REPO"
  echo
  echo "All four secrets set. Trigger a signed build with:"
  echo "  gh workflow run mobile.yml --repo $REPO"
else
  OUT="$(dirname "$KEYSTORE")/umbra-vale-keystore.base64.txt"
  printf '%s' "$B64" > "$OUT"
  chmod 600 "$OUT"
  warn "GitHub CLI not available or not signed in — set the secrets manually."
  echo
  echo "Go to: https://github.com/$REPO/settings/secrets/actions"
  echo "and add these four repository secrets:"
  echo
  echo "  ANDROID_KEYSTORE_BASE64    <contents of $OUT>"
  echo "  ANDROID_KEYSTORE_PASSWORD  <the password you just chose>"
  echo "  ANDROID_KEY_ALIAS          $ALIAS"
  echo "  ANDROID_KEY_PASSWORD       <the same password>"
  echo
  warn "Delete $OUT once the secret is saved — it contains your private key."
fi

echo
bold "Next"
echo "  Re-run the 'Mobile builds' workflow. The APK and AAB artifacts will be"
echo "  signed and ready to upload to Google Play."
echo
echo "  iOS signing needs a paid Apple Developer account; see docs/MOBILE.md."
