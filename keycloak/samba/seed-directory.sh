#!/bin/sh
set -eu

ensure_user() {
  user_name=$1
  given_name=$2
  surname=$3
  password_file=$4

  if samba-tool user show "$user_name" >/dev/null 2>&1; then
    return
  fi

  if [ ! -s "$password_file" ]; then
    echo "password file is missing or empty for $user_name: $password_file" >&2
    exit 1
  fi

  samba-tool user create \
    "$user_name" \
    "$(cat "$password_file")" \
    --given-name="$given_name" \
    --surname="$surname"
}

ensure_group() {
  group_name=$1
  description=$2

  if samba-tool group show "$group_name" >/dev/null 2>&1; then
    return
  fi

  samba-tool group add "$group_name" --description="$description"
}

ensure_member() {
  group_name=$1
  user_name=$2

  if samba-tool group listmembers "$group_name" | grep -Fqx "$user_name"; then
    return
  fi

  samba-tool group addmembers "$group_name" "$user_name"
}

ensure_user alice Alice Admin /run/secrets/samba-alice-password
ensure_user bob Bob Reader /run/secrets/samba-bob-password
ensure_group app-users "Users allowed to sign in to the Keycloak lab applications"
ensure_group api-admins "Users mapped to the Keycloak lab API administrator role"
ensure_member app-users alice
ensure_member app-users bob
ensure_member api-admins alice
