#!/usr/bin/env bash
set -euo pipefail

# Danh sách CA: thư mục, hostname container, port host (để điền SAN)
declare -A CA_MAP=(
  ["ordererOrg"]="ca.ordererorg.example.com:10054"
  ["orgProp"]="ca.orgprop.example.com:7054"
  ["orgTenant"]="ca.orgtenant.example.com:8054"
  ["orgLandlord"]="ca.orglandlord.example.com:9054"
)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for ORG in "${!CA_MAP[@]}"; do
  ORG_DIR="${ROOT_DIR}/organizations/fabric-ca/${ORG}"
  mkdir -p "${ORG_DIR}"
  HOST_PORT="${CA_MAP[$ORG]}"
  HOSTNAME="${HOST_PORT%%:*}"

  KEY="${ORG_DIR}/tls-key.pem"
  CERT="${ORG_DIR}/tls-cert.pem"
  CNF="${ORG_DIR}/openssl.cnf"

  if [[ -f "$KEY" && -f "$CERT" ]]; then
    echo "[SKIP] TLS files already exist for ${ORG} at ${ORG_DIR}"
    continue
  fi

  # openssl config với SAN
  cat > "$CNF" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no

[dn]
CN = ${HOSTNAME}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${HOSTNAME}
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

  echo "[GEN] Generating TLS key/cert for ${ORG} (${HOSTNAME}) ..."
  openssl req -x509 -nodes -newkey rsa:4096 \
    -keyout "$KEY" \
    -out "$CERT" \
    -days 3650 \
    -config "$CNF"

  chmod 600 "$KEY"
  echo "[OK ] Wrote $KEY and $CERT"
done

echo "All CA TLS certs/keys generated."
