ARG UBUNTU_IMAGE
FROM ${UBUNTU_IMAGE}

ARG SAMBA_PACKAGE_VERSION
ENV DEBIAN_FRONTEND=noninteractive

ADD https://snapshot.ubuntu.com/ubuntu/20260913T000000Z/pool/main/o/openssl/openssl_3.0.13-0ubuntu3.15_amd64.deb /tmp/bootstrap/
ADD https://snapshot.ubuntu.com/ubuntu/20260913T000000Z/pool/main/o/openssl/openssl_3.0.13-0ubuntu3.15_arm64.deb /tmp/bootstrap/
ADD https://snapshot.ubuntu.com/ubuntu/20260913T000000Z/pool/main/c/ca-certificates/ca-certificates_20260601~24.04.1_all.deb /tmp/bootstrap/

RUN printf '%s  %s\n' \
      1f2401db59a0beffde6cc47bea3664965ab8fa206b7a5ac8f1cc649cfeeb056b \
      /tmp/bootstrap/openssl_3.0.13-0ubuntu3.15_amd64.deb \
      818b4ab7092eb3365358ce41896ad08206b30cdb67445d7ec0503262893a0d95 \
      /tmp/bootstrap/openssl_3.0.13-0ubuntu3.15_arm64.deb \
      6bac2a01979e210d9eac1d4d56747ec709ea60654744d66705dc3c36e7629e50 \
      /tmp/bootstrap/ca-certificates_20260601~24.04.1_all.deb \
      | sha256sum --check --strict \
    && dpkg --install \
      "/tmp/bootstrap/openssl_3.0.13-0ubuntu3.15_$(dpkg --print-architecture).deb" \
      /tmp/bootstrap/ca-certificates_20260601~24.04.1_all.deb \
    && rm -rf /tmp/bootstrap

COPY ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources

# The corporate proxy CA (empty file when none) is trusted only inside this build step and removed
# from the OS trust store again before the layer is committed.
RUN --mount=type=secret,id=corporate_proxy_ca,target=/run/secrets/corporate-proxy-ca.crt \
    if [ -s /run/secrets/corporate-proxy-ca.crt ]; then \
      install -m 0644 /run/secrets/corporate-proxy-ca.crt \
        /usr/local/share/ca-certificates/corporate-proxy-ca.crt \
      && update-ca-certificates; \
    fi \
    && apt-get update \
    && apt-get install --yes --no-install-recommends \
      bind9-dnsutils \
      ca-certificates=20260601~24.04.1 \
      krb5-user \
      ldap-utils \
      samba="${SAMBA_PACKAGE_VERSION}" \
      samba-ad-dc="${SAMBA_PACKAGE_VERSION}" \
      samba-ad-provision="${SAMBA_PACKAGE_VERSION}" \
      samba-common-bin="${SAMBA_PACKAGE_VERSION}" \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/lib/samba/* \
    && rm -f /etc/samba/smb.conf \
    && rm -f /usr/local/share/ca-certificates/corporate-proxy-ca.crt \
    && update-ca-certificates --fresh

COPY entrypoint.sh /usr/local/bin/keycloak-lab-samba-entrypoint
COPY seed-directory.sh /usr/local/bin/seed-directory
COPY verify-directory.sh /usr/local/bin/verify-directory

RUN chmod 0755 \
      /usr/local/bin/keycloak-lab-samba-entrypoint \
      /usr/local/bin/seed-directory \
      /usr/local/bin/verify-directory

EXPOSE 53/tcp 53/udp 88/tcp 88/udp 135/tcp 137/udp 138/udp 139/tcp \
  389/tcp 389/udp 445/tcp 464/tcp 464/udp 636/tcp 3268/tcp 3269/tcp

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/keycloak-lab-samba-entrypoint"]
