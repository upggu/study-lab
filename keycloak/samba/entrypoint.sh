#!/bin/sh
set -eu

: "${SAMBA_REALM:?SAMBA_REALM is required}"
: "${SAMBA_DOMAIN:?SAMBA_DOMAIN is required}"
: "${SAMBA_HOST_NAME:?SAMBA_HOST_NAME is required}"
: "${SAMBA_DNS_FORWARDER:?SAMBA_DNS_FORWARDER is required}"

admin_password_file=/run/secrets/samba-admin-password
certificate_directory=/run/keycloak-lab/certs
tls_key_secret=/run/secrets/samba-tls-key
# Samba only accepts a TLS key that is root-owned and 0600. The Compose file secret keeps the
# host owner on Docker Engine, so the key is copied to a root-owned runtime file at every start.
tls_key_directory=/run/keycloak-lab/tls
tls_key_file=$tls_key_directory/dc1.key
persisted_config=/var/lib/samba/etc/smb.conf
domain_database=/var/lib/samba/private/sam.ldb

for required_file in \
  "$admin_password_file" \
  "$certificate_directory/ca.crt" \
  "$certificate_directory/dc1.crt" \
  "$tls_key_secret"
do
  if [ ! -s "$required_file" ]; then
    echo "required Samba input is missing or empty: $required_file" >&2
    exit 1
  fi
done

mkdir -p "$tls_key_directory"
chmod 0700 "$tls_key_directory"
install -m 0600 -o root -g root "$tls_key_secret" "$tls_key_file"

if [ ! -e "$domain_database" ]; then
  if find /var/lib/samba -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    echo "Samba data volume is non-empty but has no domain database; refusing to reprovision" >&2
    exit 1
  fi

  rm -f /etc/samba/smb.conf
  samba-tool domain provision \
    --realm="$SAMBA_REALM" \
    --domain="$SAMBA_DOMAIN" \
    --host-name="$SAMBA_HOST_NAME" \
    --server-role=dc \
    --use-rfc2307 \
    --dns-backend=SAMBA_INTERNAL \
    --adminpass="$(cat "$admin_password_file")"

  sed -i \
    -e "s|^[[:space:]]*dns forwarder[[:space:]]*=.*|\tdns forwarder = $SAMBA_DNS_FORWARDER|" \
    -e "/^\[global\]$/a\\
\ttls cafile = $certificate_directory/ca.crt\\
\ttls certfile = $certificate_directory/dc1.crt\\
\ttls keyfile = $tls_key_file\\
\ttls enabled = yes" \
    /etc/samba/smb.conf

  mkdir -p "$(dirname "$persisted_config")"
  cp /etc/samba/smb.conf "$persisted_config"
elif [ ! -s "$persisted_config" ]; then
  echo "Samba domain database exists but its persisted smb.conf is missing; refusing to guess" >&2
  exit 1
else
  sed -i \
    -e "s|^[[:space:]]*tls keyfile[[:space:]]*=.*|\ttls keyfile = $tls_key_file|" \
    "$persisted_config"
  cp "$persisted_config" /etc/samba/smb.conf
fi

testparm --suppress-prompt >/dev/null
/usr/local/bin/seed-directory

exec samba --foreground --no-process-group
