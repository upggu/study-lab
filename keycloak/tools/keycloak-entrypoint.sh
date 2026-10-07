#!/bin/bash
# Keycloak container entrypoint: load the two secrets Keycloak reads from the environment, then start.
set -euo pipefail

read_secret() {
  [[ -s "$2" ]] || { printf 'required Keycloak secret is missing or empty: %s\n' "$2" >&2; exit 1; }
  printf -v "$1" '%s' "$(<"$2")"
  export "$1"
}

read_secret KC_DB_PASSWORD /run/secrets/keycloak-db-password
read_secret KC_BOOTSTRAP_ADMIN_PASSWORD /run/secrets/keycloak-admin-password

exec /opt/keycloak/bin/kc.sh start
