#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/ixasales/staging}"
ARTIFACT_PATH="${ARTIFACT_PATH:-}"
FRONTEND_URL="${FRONTEND_URL:-https://dev.ixasales.uz}"
API_HEALTH_URL="${API_HEALTH_URL:-https://dev-api.ixasales.uz/health}"
LOCAL_HEALTH_HOST="${LOCAL_HEALTH_HOST:-127.0.0.1}"
BLUE_PORT="${BLUE_PORT:-3001}"
GREEN_PORT="${GREEN_PORT:-3102}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
RUN_DB_MIGRATE="${RUN_DB_MIGRATE:-1}"
UPSTREAM_CONF="${UPSTREAM_CONF:-/etc/nginx/snippets/ixasales-staging-api-upstream.conf}"
CURRENT_LINK="${APP_ROOT}/current"
RELEASES_DIR="${APP_ROOT}/releases"
SHARED_DIR="${APP_ROOT}/shared"
ACTIVE_SLOT_FILE="${SHARED_DIR}/active-slot"
LOCKFILE="${APP_ROOT}/shared/deploy.lock"

if [[ -z "${ARTIFACT_PATH}" || ! -f "${ARTIFACT_PATH}" ]]; then
  echo "ARTIFACT_PATH must point to an existing .tgz artifact." >&2
  exit 1
fi

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root." >&2
    exit 1
  fi
}

wait_for_health() {
  local url="$1"
  local attempts="${2:-30}"
  local delay="${3:-2}"

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

release_smoke_check() {
  local expected_js="$1"
  local expected_css="$2"
  local frontend_html

  frontend_html="$(curl -fsS "${FRONTEND_URL}/")"
  [[ "${frontend_html}" == *"${expected_js}"* ]]
  [[ "${frontend_html}" == *"${expected_css}"* ]]
  curl -fsS "${API_HEALTH_URL}" >/dev/null
}

main() {
  require_root
  exec 9>"${LOCKFILE}"
  flock -n 9 || { echo "Another deployment is already running." >&2; exit 1; }

  local timestamp release_dir active_slot inactive_slot old_release inactive_port active_service inactive_service
  local js_asset css_asset previous_upstream deps_hash deps_dir deps_tmp
  local migrate_hash migrate_dir migrate_tmp db_status

  timestamp="$(date +%Y%m%d%H%M%S)"
  release_dir="${RELEASES_DIR}/${timestamp}"
  mkdir -p "${release_dir}" "${SHARED_DIR}/node_modules"
  tar -xzf "${ARTIFACT_PATH}" -C "${release_dir}"

  test -f "${release_dir}/dist/index-fastify.js"
  test -f "${release_dir}/client/dist/index.html"
  test -f "${release_dir}/package.json"
  test -f "${release_dir}/package-lock.json"
  test -f "${release_dir}/drizzle.config.ts"
  test -d "${release_dir}/drizzle"

  deps_hash="$(sha256sum "${release_dir}/package-lock.json" | awk '{print $1}')"
  deps_dir="${SHARED_DIR}/node_modules/${deps_hash}"
  if [[ ! -d "${deps_dir}" ]]; then
    deps_tmp="${deps_dir}.tmp-${timestamp}"
    mkdir -p "${deps_tmp}"
    cp "${release_dir}/package.json" "${release_dir}/package-lock.json" "${deps_tmp}/"
    pushd "${deps_tmp}" >/dev/null
    npm ci --omit=dev --include=optional
    popd >/dev/null
    mv "${deps_tmp}/node_modules" "${deps_dir}"
    rm -rf "${deps_tmp}"
  fi
  ln -sfn "${deps_dir}" "${release_dir}/node_modules"

  if [[ -f "${APP_ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${APP_ROOT}/.env"
    set +a
  fi

  if [[ "${RUN_DB_MIGRATE}" == "1" ]]; then
    migrate_hash="${deps_hash}-migrate"
    migrate_dir="${SHARED_DIR}/node_modules/${migrate_hash}"
    if [[ ! -d "${migrate_dir}" ]]; then
      migrate_tmp="${migrate_dir}.tmp-${timestamp}"
      mkdir -p "${migrate_tmp}"
      cp "${release_dir}/package.json" "${release_dir}/package-lock.json" "${migrate_tmp}/"
      pushd "${migrate_tmp}" >/dev/null
      npm ci --include=dev --omit=optional
      popd >/dev/null
      mv "${migrate_tmp}/node_modules" "${migrate_dir}"
      rm -rf "${migrate_tmp}"
    fi

    pushd "${release_dir}" >/dev/null
    ln -sfn "${migrate_dir}" "${release_dir}/node_modules"
    set +e
    npm run db:migrate
    db_status=$?
    set -e
    popd >/dev/null
    if [[ ${db_status} -ne 0 ]]; then
      ln -sfn "${deps_dir}" "${release_dir}/node_modules"
      rm -rf "${release_dir}"
      echo "Database migration failed." >&2
      exit 1
    fi

    ln -sfn "${deps_dir}" "${release_dir}/node_modules"
  fi

  active_slot="blue"
  if [[ -f "${ACTIVE_SLOT_FILE}" ]]; then
    active_slot="$(tr -d '[:space:]' < "${ACTIVE_SLOT_FILE}")"
  fi
  if [[ "${active_slot}" == "blue" ]]; then
    inactive_slot="green"
    inactive_port="${GREEN_PORT}"
  else
    inactive_slot="blue"
    inactive_port="${BLUE_PORT}"
  fi

  old_release=""
  if [[ -L "${CURRENT_LINK}" ]]; then
    old_release="$(readlink -f "${CURRENT_LINK}")"
  fi
  previous_upstream="$(cat "${UPSTREAM_CONF}" 2>/dev/null || true)"

  cat > "${SHARED_DIR}/backend-${inactive_slot}.env" <<EOF
PORT=${inactive_port}
RELEASE_DIR=${release_dir}
EOF

  inactive_service="ixasales-staging@${inactive_slot}.service"
  active_service="ixasales-staging@${active_slot}.service"

  if [[ "${inactive_slot}" == "blue" ]] && systemctl is-active --quiet ixasales-staging.service; then
    systemctl stop ixasales-staging.service
    systemctl disable ixasales-staging.service >/dev/null 2>&1 || true
  fi

  systemctl daemon-reload
  systemctl restart "${inactive_service}"

  if ! wait_for_health "http://${LOCAL_HEALTH_HOST}:${inactive_port}/health" 45 2; then
    journalctl -u "${inactive_service}" -n 50 --no-pager >&2 || true
    systemctl stop "${inactive_service}" || true
    rm -rf "${release_dir}"
    echo "Inactive slot did not become healthy." >&2
    exit 1
  fi

  js_asset="$(sed -n 's|.*src=\"\\(/assets/index-[^\"]*\\.js\\)\".*|\\1|p' "${release_dir}/client/dist/index.html" | head -n 1)"
  css_asset="$(sed -n 's|.*href=\"\\(/assets/index-[^\"]*\\.css\\)\".*|\\1|p' "${release_dir}/client/dist/index.html" | head -n 1)"

  ln -sfn "${release_dir}" "${CURRENT_LINK}"
  if [[ -e "${APP_ROOT}/dist" && ! -L "${APP_ROOT}/dist" ]]; then
    mv "${APP_ROOT}/dist" "${APP_ROOT}/dist.legacy-${timestamp}"
  fi
  ln -sfn "${release_dir}/dist" "${APP_ROOT}/dist"
  mkdir -p "${APP_ROOT}/client"
  if [[ -e "${APP_ROOT}/client/dist" && ! -L "${APP_ROOT}/client/dist" ]]; then
    mv "${APP_ROOT}/client/dist" "${APP_ROOT}/client/dist.legacy-${timestamp}"
  fi
  ln -sfn "${release_dir}/client/dist" "${APP_ROOT}/client/dist"

  printf 'proxy_pass http://127.0.0.1:%s;\n' "${inactive_port}" > "${UPSTREAM_CONF}"
  nginx -t
  systemctl reload nginx

  if ! release_smoke_check "${js_asset}" "${css_asset}"; then
    [[ -n "${previous_upstream}" ]] && printf '%s\n' "${previous_upstream}" > "${UPSTREAM_CONF}"
    if [[ -n "${old_release}" ]]; then
      ln -sfn "${old_release}" "${CURRENT_LINK}"
      ln -sfn "${old_release}/dist" "${APP_ROOT}/dist"
      ln -sfn "${old_release}/client/dist" "${APP_ROOT}/client/dist"
    fi
    nginx -t
    systemctl reload nginx
    systemctl stop "${inactive_service}" || true
    echo "Post-switch smoke check failed. Rollback applied." >&2
    exit 1
  fi

  printf '%s\n' "${inactive_slot}" > "${ACTIVE_SLOT_FILE}"
  chown "${APP_USER:-ilhom1983}:${APP_GROUP:-ilhom1983}" "${ACTIVE_SLOT_FILE}" "${SHARED_DIR}/backend-${inactive_slot}.env" || true

  if systemctl is-active --quiet "${active_service}"; then
    systemctl stop "${active_service}" || true
  fi
  if systemctl is-active --quiet ixasales-staging.service; then
    systemctl stop ixasales-staging.service || true
  fi
  systemctl disable ixasales-staging.service >/dev/null 2>&1 || true

  find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort | head -n -"${KEEP_RELEASES}" 2>/dev/null | while read -r old; do
    if [[ "${old}" != "${release_dir}" && "${old}" != "${old_release}" ]]; then
      rm -rf "${old}"
    fi
  done

  rm -f "${ARTIFACT_PATH}"
  echo "Deployment successful."
  echo "Active slot: ${inactive_slot}"
  echo "Release: ${release_dir}"
}

main "$@"
