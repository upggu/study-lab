#!/bin/sh
# keycloak-config-cli container entrypoint. Java cannot read a PEM CA directly, so the lab web CA is
# packed into a throw-away PKCS12 truststore first; the password only protects a public certificate.
set -eu
keytool -importcert -noprompt -trustcacerts -alias keycloak-lab-web-ca \
  -file /lab/web-ca.crt -keystore /tmp/web-ca.p12 -storetype PKCS12 \
  -storepass "$KEYCLOAK_TLS_TRUSTSTOREPASSWORD" >/dev/null
exec java ${JAVA_OPTS:-} -jar /app/keycloak-config-cli.jar "$@"
