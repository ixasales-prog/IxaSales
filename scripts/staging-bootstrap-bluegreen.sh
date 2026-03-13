#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/ixasales/staging}"
APP_USER="${APP_USER:-ilhom1983}"
APP_GROUP="${APP_GROUP:-ilhom1983}"
FRONTEND_HOST="${FRONTEND_HOST:-dev.ixasales.uz}"
API_HOST="${API_HOST:-dev-api.ixasales.uz}"
SSL_CERT_HOST="${SSL_CERT_HOST:-dev.ixasales.uz}"
BLUE_PORT="${BLUE_PORT:-3001}"
GREEN_PORT="${GREEN_PORT:-3002}"
SYSTEMD_TEMPLATE="/etc/systemd/system/ixasales-staging@.service"
NGINX_SITE="/etc/nginx/sites-available/ixasales-staging"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/ixasales-staging"
UPSTREAM_CONF="/etc/nginx/snippets/ixasales-staging-api-upstream.conf"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root." >&2
    exit 1
  fi
}

render_systemd_template() {
  cat > "${SYSTEMD_TEMPLATE}" <<EOF
[Unit]
Description=IxaSales Staging API (%i)
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_ROOT}
EnvironmentFile=${APP_ROOT}/.env
EnvironmentFile=-${APP_ROOT}/shared/backend-%i.env
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/bash -lc 'cd "\$RELEASE_DIR" && exec /usr/bin/node dist/index-fastify.js'
Restart=always
RestartSec=5
TimeoutStartSec=60
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
EOF
}

render_nginx_site() {
  cat > "${NGINX_SITE}" <<EOF
# IxaSales staging frontend + API
server {
    server_name ${API_HOST};

    location / {
        include ${UPSTREAM_CONF};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 50M;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/${SSL_CERT_HOST}/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/${SSL_CERT_HOST}/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if (\$host = ${API_HOST}) {
        return 301 https://\$host\$request_uri;
    }

    listen 80;
    server_name ${API_HOST};
    return 404;
}

server {
    server_name ${FRONTEND_HOST};

    root ${APP_ROOT}/current/client/dist;
    index index.html;

    location = /index.html {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    location = /sw.js {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    location = /manifest.webmanifest {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/${FRONTEND_HOST}/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/${FRONTEND_HOST}/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if (\$host = ${FRONTEND_HOST}) {
        return 301 https://\$host\$request_uri;
    }

    listen 80;
    server_name ${FRONTEND_HOST};
    return 404;
}
EOF
}

main() {
  require_root

  local legacy_release
  install -d -o "${APP_USER}" -g "${APP_GROUP}" "${APP_ROOT}/releases" "${APP_ROOT}/shared" "${APP_ROOT}/shared/node_modules" "${APP_ROOT}/client"
  install -d /etc/nginx/snippets

  legacy_release="${APP_ROOT}/releases/legacy-bootstrap"
  if [[ ! -d "${legacy_release}" ]]; then
    mkdir -p "${legacy_release}/client"
    if [[ -d "${APP_ROOT}/dist" ]]; then
      cp -a "${APP_ROOT}/dist" "${legacy_release}/dist"
    fi
    if [[ -d "${APP_ROOT}/client/dist" ]]; then
      cp -a "${APP_ROOT}/client/dist" "${legacy_release}/client/dist"
    fi
    if [[ -f "${APP_ROOT}/package.json" ]]; then
      cp "${APP_ROOT}/package.json" "${legacy_release}/package.json"
    fi
    if [[ -f "${APP_ROOT}/package-lock.json" ]]; then
      cp "${APP_ROOT}/package-lock.json" "${legacy_release}/package-lock.json"
    fi
    chown -R "${APP_USER}:${APP_GROUP}" "${legacy_release}"
  fi

  ln -sfn "${legacy_release}" "${APP_ROOT}/current"

  if [[ ! -f "${APP_ROOT}/shared/active-slot" ]]; then
    printf 'blue\n' > "${APP_ROOT}/shared/active-slot"
    chown "${APP_USER}:${APP_GROUP}" "${APP_ROOT}/shared/active-slot"
  fi

  cat > "${APP_ROOT}/shared/backend-blue.env" <<EOF
PORT=${BLUE_PORT}
RELEASE_DIR=${APP_ROOT}
EOF
  cat > "${APP_ROOT}/shared/backend-green.env" <<EOF
PORT=${GREEN_PORT}
RELEASE_DIR=${APP_ROOT}
EOF
  chown "${APP_USER}:${APP_GROUP}" "${APP_ROOT}/shared/backend-blue.env" "${APP_ROOT}/shared/backend-green.env"

  render_systemd_template

  cat > "${UPSTREAM_CONF}" <<EOF
proxy_pass http://127.0.0.1:${BLUE_PORT};
EOF

  render_nginx_site
  ln -sfn "${NGINX_SITE}" "${NGINX_SITE_LINK}"

  systemctl daemon-reload
  systemctl enable "ixasales-staging@blue.service" "ixasales-staging@green.service" >/dev/null 2>&1 || true
  nginx -t
  systemctl reload nginx

  echo "Bootstrap complete."
  echo "Release root: ${APP_ROOT}/releases"
  echo "Current symlink target: ${APP_ROOT}/current"
  echo "Blue port: ${BLUE_PORT}"
  echo "Green port: ${GREEN_PORT}"
}

main "$@"
