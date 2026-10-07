#!/bin/sh
set -eu

realm=AD.KEYCLOAK.TEST
base_dn='DC=ad,DC=keycloak,DC=test'
ldap_url=ldaps://dc1.ad.keycloak.test:636
ca_file=/run/keycloak-lab/certs/ca.crt
admin_password_file=/run/secrets/samba-admin-password
alice_password_file=/run/secrets/samba-alice-password
bob_password_file=/run/secrets/samba-bob-password

export LDAPTLS_CACERT="$ca_file"

directory_result=$(ldapsearch -LLL -x \
  -H "$ldap_url" \
  -D "Administrator@$realm" \
  -w "$(cat "$admin_password_file")" \
  -b "$base_dn" \
  '(|(sAMAccountName=alice)(sAMAccountName=bob)(sAMAccountName=app-users)(sAMAccountName=api-admins))' \
  sAMAccountName member)

for account_name in alice bob app-users api-admins; do
  if ! printf '%s\n' "$directory_result" | grep -Fqx "sAMAccountName: $account_name"; then
    echo "directory lookup did not return $account_name" >&2
    exit 1
  fi
done

alice_bind=$(ldapwhoami -x \
  -H "$ldap_url" \
  -D "alice@$realm" \
  -w "$(cat "$alice_password_file")")
bob_bind=$(ldapwhoami -x \
  -H "$ldap_url" \
  -D "bob@$realm" \
  -w "$(cat "$bob_password_file")")

if ! printf '%s\n' "$alice_bind" | grep -Fqx 'u:KEYCLOAK\alice'; then
  echo "alice LDAPS bind returned an unexpected identity: $alice_bind" >&2
  exit 1
fi
if ! printf '%s\n' "$bob_bind" | grep -Fqx 'u:KEYCLOAK\bob'; then
  echo "bob LDAPS bind returned an unexpected identity: $bob_bind" >&2
  exit 1
fi

app_members=$(samba-tool group listmembers app-users | sort)
api_members=$(samba-tool group listmembers api-admins | sort)
if [ "$app_members" != "$(printf 'alice\nbob\n' | sort)" ]; then
  echo "app-users has unexpected members: $app_members" >&2
  exit 1
fi
if [ "$api_members" != alice ]; then
  echo "api-admins has unexpected members: $api_members" >&2
  exit 1
fi

domain_info=$(net getdomainsid)
domain_sid=$(printf '%s\n' "$domain_info" \
  | sed -n 's/^SID for domain KEYCLOAK is: //p')

if [ -z "$domain_sid" ]; then
  echo "could not read the Samba domain SID" >&2
  exit 1
fi

printf 'domain_sid=%s\n' "$domain_sid"
printf 'users=alice,bob\n'
printf 'groups=app-users(alice,bob),api-admins(alice)\n'
printf 'user_binds=alice,bob\n'
