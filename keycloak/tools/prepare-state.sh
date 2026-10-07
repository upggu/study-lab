#!/bin/sh
# Generate the private lab state under .state/ (Git-ignored): passwords, client secrets, the two CAs
# and their server certificates, and the optional corporate proxy CA copy. Idempotent; existing
# files are kept so a re-run never invalidates data already stored in the Docker volumes.
set -eu

lab_directory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
state_directory=$lab_directory/.state
secret_directory=$state_directory/secrets
web_ca=$state_directory/web-ca
directory_ca=$state_directory/directory-ca
build_directory=$state_directory/build

umask 077
mkdir -p "$secret_directory" "$web_ca" "$directory_ca" "$build_directory"
chmod 0700 "$state_directory" "$secret_directory" "$web_ca" "$directory_ca" "$build_directory"

# --- corporate proxy CA (image builds only; see compose.yaml x-build-proxy-args) ---------------
proxy_ca_file=$build_directory/corporate-proxy-ca.crt
if [ -n "${CORP_CA_FILE:-}" ]; then
  openssl x509 -noout -in "$CORP_CA_FILE" >/dev/null 2>&1 || \
    { echo "CORP_CA_FILE is not a PEM certificate: $CORP_CA_FILE" >&2; exit 1; }
  cp "$CORP_CA_FILE" "$proxy_ca_file"
  chmod 0600 "$proxy_ca_file"
  printf 'copied corporate proxy CA into %s\n' "$proxy_ca_file"
elif [ ! -e "$proxy_ca_file" ]; then
  : >"$proxy_ca_file"   # empty file = no proxy CA
fi

# --- passwords and client secrets (no trailing newline: they are substituted verbatim) ---------
create_secret() {
  if [ ! -s "$secret_directory/$1" ]; then
    printf 'Aa1!%s' "$(openssl rand -hex 20)" >"$secret_directory/$1"
  fi
  chmod 0600 "$secret_directory/$1"
}
for secret_name in \
  samba-admin-password samba-alice-password samba-bob-password \
  keycloak-db-password keycloak-admin-password local-user-password \
  app-a-client-secret app-a-session-secret app-b-client-secret app-b-session-secret \
  partner-carol-password partner-dave-password study-broker-client-secret
do
  create_secret "$secret_name"
done

# --- certificate authorities and server certificates ------------------------------------------
create_ca() {   # create_ca <dir> <common name>
  if [ ! -e "$1/ca.key" ]; then
    openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
      -keyout "$1/ca.key" -out "$1/ca.crt" -subj "/CN=$2" \
      -addext 'basicConstraints=critical,CA:TRUE' \
      -addext 'keyUsage=critical,keyCertSign,cRLSign' \
      -addext 'subjectKeyIdentifier=hash' 2>/dev/null
  fi
  chmod 0600 "$1/ca.key"
  chmod 0644 "$1/ca.crt"
}

create_server_certificate() {   # create_server_certificate <ca dir> <name> <dns name>
  if [ ! -e "$1/$2.key" ]; then
    extension_file=$1/$2.ext.tmp
    printf '%s\n' \
      'basicConstraints = critical, CA:FALSE' \
      'keyUsage = critical, digitalSignature, keyEncipherment' \
      'extendedKeyUsage = serverAuth' \
      "subjectAltName = DNS:$3" \
      'subjectKeyIdentifier = hash' \
      'authorityKeyIdentifier = keyid,issuer' >"$extension_file"
    openssl req -new -newkey rsa:3072 -sha256 -nodes \
      -keyout "$1/$2.key" -out "$1/$2.csr" -subj "/CN=$3" 2>/dev/null
    openssl x509 -req -sha256 -days 365 -in "$1/$2.csr" \
      -CA "$1/ca.crt" -CAkey "$1/ca.key" -CAserial "$1/ca.srl" -CAcreateserial \
      -out "$1/$2.crt" -extfile "$extension_file" 2>/dev/null
    rm -f "$1/$2.csr" "$extension_file"
  fi
  chmod 0600 "$1/$2.key"
  chmod 0644 "$1/$2.crt"
  openssl verify -CAfile "$1/ca.crt" "$1/$2.crt" >/dev/null
}

create_ca "$web_ca" keycloak-lab-web-ca
create_server_certificate "$web_ca" keycloak keycloak.keycloak.test
create_server_certificate "$web_ca" app-a app-a.keycloak.test
create_server_certificate "$web_ca" app-b app-b.keycloak.test

create_ca "$directory_ca" keycloak-lab-directory-ca
create_server_certificate "$directory_ca" dc1 dc1.ad.keycloak.test

printf 'private lab state is ready in %s\n' "$state_directory"
