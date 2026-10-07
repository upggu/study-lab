ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
FROM ${NODE_IMAGE}

WORKDIR /opt/keycloak-lab-app

COPY package.json package-lock.json ./
# bookworm-slim has no update-ca-certificates; Node reads the corporate proxy CA (empty file when
# none) straight from NODE_EXTRA_CA_CERTS for this step only. The secret is not kept in the image.
RUN --mount=type=secret,id=corporate_proxy_ca,target=/usr/local/share/ca-certificates/corporate-proxy-ca.crt \
    if [ -s /usr/local/share/ca-certificates/corporate-proxy-ca.crt ]; then \
      export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/corporate-proxy-ca.crt; \
    fi \
    && npm ci --omit=dev && npm cache clean --force

COPY api-healthcheck.mjs api.mjs healthcheck.mjs server.mjs ./

USER node

CMD ["node", "server.mjs"]
