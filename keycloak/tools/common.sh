#!/bin/sh
# Shared helpers for lab.sh. Not a user entrypoint.

: "${lab_directory:?lab.sh sets lab_directory before sourcing common.sh}"
state_directory=$lab_directory/.state
stage_file=$state_directory/stage
project_name=keycloak-lab
stages='base app-a app-b api ldap groups broker'
checks='base app-a sso api ldap groups broker'

fail() { echo "$*" >&2; exit 1; }

# LAB_UID/LAB_GID: the config-cli container runs as the host user so it can read the 0600 file secrets
# (Docker Engine keeps the host owner on bind-mounted secrets; the image's default user is nobody).
compose() {
  LAB_UID=$(id -u) LAB_GID=$(id -g) \
    "$lab_directory/tools/compose.sh" --project-name "$project_name" --file "$lab_directory/compose.yaml" "$@"
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail 'the docker CLI is required'
  docker info >/dev/null 2>&1 || fail 'a running Docker runtime is required (macOS: colima start)'
  compose version >/dev/null 2>&1 || fail 'Docker Compose is required (docker compose version)'
  docker buildx version >/dev/null 2>&1 || \
    fail 'the docker buildx plugin is required: image builds receive the corporate proxy CA as a BuildKit secret'
}

check_capacity() {
  capacity_cpus=$(docker info --format '{{.NCPU}}')
  capacity_memory=$(docker info --format '{{.MemTotal}}')
  if [ "$capacity_cpus" -lt 4 ] || [ "$capacity_memory" -lt 7500000000 ]; then
    fail "the lab expects a 4 CPU / 8 GiB runtime; Docker reports $capacity_cpus CPUs and $capacity_memory bytes"
  fi
}

stage_rank() {
  case $1 in
    base) echo 0 ;; app-a) echo 1 ;; app-b) echo 2 ;; api) echo 3 ;;
    ldap) echo 4 ;; groups) echo 5 ;; broker) echo 6 ;; *) echo -1 ;;
  esac
}

current_stage() { if [ -f "$stage_file" ]; then cat "$stage_file"; else echo none; fi }

write_stage() {
  mkdir -p "$state_directory"
  chmod 0700 "$state_directory"
  printf '%s\n' "$1" >"$stage_file"
}

# Long-running services expected once a stage is applied. Apps appear with their stage.
services_for_stage() {
  case $1 in
    none|base) echo 'samba postgres keycloak' ;;
    app-a) echo 'samba postgres keycloak app-a' ;;
    app-b) echo 'samba postgres keycloak app-a app-b' ;;
    *) echo 'samba postgres keycloak app-a app-b api' ;;
  esac
}

service_started_by_stage() {
  case $1 in app-a) echo app-a ;; app-b) echo app-b ;; api) echo api ;; *) echo '' ;; esac
}

# keycloak-config-cli file list for a stage (mounted at /config in the config service).
stage_files() {
  case $1 in
    broker) echo 'file:/config/partner-idp.yaml,file:/config/study/broker.yaml' ;;
    *) echo "file:/config/study/$1.yaml" ;;
  esac
}
