#!/bin/sh
# Keycloak lab. Compose runs the stand-ins (Samba AD DC, partner IdP realm) and our apps;
# keycloak-config-cli applies our realm from realm/study/<stage>.yaml.
#
#   ./lab.sh up                  prepare CA/secrets, start samba·postgres·keycloak (+ this stage's apps after a down)
#   ./lab.sh apply <stage>       apply realm/study/<stage>.yaml, then start the app that stage introduces
#   ./lab.sh sync                LDAP user/group sync (an operation, not configuration)
#   ./lab.sh verify <check>      scripted login check: base|app-a|sso|api|ldap|groups|broker
#   ./lab.sh status              stage and container health
#   ./lab.sh down                stop containers; keep volumes and .state
#   ./lab.sh reset [--confirm DELETE-keycloak-lab]   delete containers, volumes and generated state
#
# stages, in order: base → app-a → app-b → api → ldap → groups → broker
set -eu
lab_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$lab_directory/tools/common.sh"
cd "$lab_directory"

usage() { sed -n '2,12p' "$0" >&2; exit 2; }

cmd_up() {
  require_docker
  check_capacity
  tools/prepare-state.sh
  # shellcheck disable=SC2046
  compose up --detach --wait --build $(services_for_stage "$(current_stage)")
  cmd_status
}

cmd_apply() {
  stage=${1:-}
  [ "$(stage_rank "$stage")" -ge 0 ] || usage
  require_docker
  current=$(current_stage)
  if [ "$(stage_rank "$stage")" -gt $(( $(stage_rank "$current") + 1 )) ]; then
    fail "current stage is $current; apply the stages in order ($stages)"
  fi
  if [ "$(stage_rank "$stage")" -lt "$(stage_rank "$current")" ] && [ "${2:-}" != --rewind ]; then
    fail "$stage comes before the current stage $current. Its file omits the later objects, so config-cli would delete them. Add --rewind if that is what you want."
  fi
  files=$(stage_files "$stage")
  printf '\n== keycloak-config-cli: %s\n' "$files"
  compose run --rm --env "IMPORT_FILES_LOCATIONS=$files" config
  service=$(service_started_by_stage "$stage")
  if [ -n "$service" ]; then
    printf '\n== starting %s\n' "$service"
    compose up --detach --wait --build "$service"
  fi
  if [ "$(stage_rank "$stage")" -ne "$(stage_rank "$current")" ]; then write_stage "$stage"; fi
  cmd_status
}

cmd_sync() {
  require_docker
  compose run --rm --no-deps check /lab/checks/sync.mjs
}

cmd_verify() {
  check=${1:-}
  case " $checks " in *" $check "*) ;; *) usage ;; esac
  require_docker
  compose run --rm --no-deps check /lab/checks/login-check.mjs "$check"
}

cmd_status() {
  printf 'stage: %s   (expected services: %s)\n' "$(current_stage)" "$(services_for_stage "$(current_stage)")"
  compose ps --all --format 'table {{.Service}}\t{{.Status}}'
}

cmd_down() {
  require_docker
  compose down --remove-orphans
  printf 'stopped; volumes and .state are kept. ./lab.sh up resumes stage %s\n' "$(current_stage)"
}

cmd_reset() {
  require_docker
  printf 'reset removes: the keycloak-lab containers and network, volumes keycloak-lab-samba-dc and\n'
  printf 'keycloak-lab-keycloak-db, and .state/{secrets,web-ca,directory-ca,build,stage}. Images stay.\n'
  if [ "${1:-}" != --confirm ] || [ "${2:-}" != DELETE-keycloak-lab ]; then
    printf 'dry run only. To delete: ./lab.sh reset --confirm DELETE-keycloak-lab\n'
    return 0
  fi
  compose down --volumes --remove-orphans
  rm -rf "$state_directory/secrets" "$state_directory/web-ca" "$state_directory/directory-ca" \
    "$state_directory/build" "$stage_file"
  printf 'reset done\n'
}

command=${1:-}
[ "$#" -ge 1 ] && shift
case $command in
  up) cmd_up "$@" ;;
  apply) cmd_apply "$@" ;;
  sync) cmd_sync "$@" ;;
  verify) cmd_verify "$@" ;;
  status) cmd_status "$@" ;;
  down) cmd_down "$@" ;;
  reset) cmd_reset "$@" ;;
  *) usage ;;
esac
