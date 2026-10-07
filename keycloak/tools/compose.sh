#!/bin/sh
set -eu

if docker compose version >/dev/null 2>&1; then
  exec docker compose "$@"
fi

if [ "$(uname -s)" != Darwin ]; then
  echo 'Docker Compose plugin 5.5.1 is required on Ubuntu' >&2
  exit 1
fi

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tool_directory=$(CDPATH= cd -- "$script_directory/.." && pwd)/.state/tools
compose_version=5.5.1

case $(uname -m) in
  arm64)
    compose_asset=docker-compose-darwin-aarch64
    compose_sha256=998735c9b6fe68a4f05895e6ea73d71ad06f9fc7046383ad89e47346781b6af5
    ;;
  x86_64)
    compose_asset=docker-compose-darwin-x86_64
    compose_sha256=a264d61e824bf08a78867e59cdf32eb09f0aee9ecdf9f6ebfa43f76dc52880f1
    ;;
  *)
    echo "unsupported macOS architecture for Docker Compose: $(uname -m)" >&2
    exit 1
    ;;
esac

compose_binary=$tool_directory/docker-compose-$compose_version
mkdir -p "$tool_directory"
chmod 0700 "$(dirname "$tool_directory")" "$tool_directory"

verify_binary() {
  actual_sha256=$(shasum -a 256 "$compose_binary" | awk '{print $1}')
  [ "$actual_sha256" = "$compose_sha256" ]
}

if [ ! -x "$compose_binary" ] || ! verify_binary; then
  temporary_binary=$compose_binary.tmp.$$
  trap 'rm -f "$temporary_binary"' EXIT HUP INT TERM
  curl --fail --location --silent --show-error \
    "https://github.com/docker/compose/releases/download/v$compose_version/$compose_asset" \
    --output "$temporary_binary"
  actual_sha256=$(shasum -a 256 "$temporary_binary" | awk '{print $1}')
  if [ "$actual_sha256" != "$compose_sha256" ]; then
    echo "Docker Compose checksum mismatch: $actual_sha256" >&2
    exit 1
  fi
  chmod 0700 "$temporary_binary"
  mv "$temporary_binary" "$compose_binary"
  trap - EXIT HUP INT TERM
fi

exec "$compose_binary" "$@"
