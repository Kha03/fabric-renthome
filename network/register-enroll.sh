#!/bin/bash
# Register and enroll identities for OrdererOrg, OrgProp, OrgTenant, OrgLandlord via Fabric CA
# Requires: fabric-ca-client in PATH (run ./bootstrap.sh then export PATH)

set -euo pipefail

FABRIC_CA_CLIENT="../bin/fabric-ca-client"
CA_ADMIN=admin
CA_ADMIN_PW=adminpw

# ---- ADD: helpers để chuẩn bị MSP cấp tổ chức ----
write_nodeou_config() {
  local dest_msp_dir="$1"       # .../msp
  local ca_filename="$2"        # ví dụ: localhost-10054-ca-orderer-org.pem
  mkdir -p "${dest_msp_dir}"
  cat > "${dest_msp_dir}/config.yaml" <<EOF
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${ca_filename}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${ca_filename}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${ca_filename}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${ca_filename}
    OrganizationalUnitIdentifier: orderer
EOF
}

# kind = orderer|peer ; org_domain ví dụ: ordererorg.example.com | orgprop.example.com
prepare_org_msp() {
  local org="$1"         # ordererOrg|orgProp|orgTenant|orgLandlord
  local org_domain="$2"  # ordererorg.example.com|orgprop.example.com|...
  local port="$3"        # 10054|7054|8054|9054
  local ca_name="$4"     # ca-orderer-org|ca-orgprop|...
  local kind="$5"        # orderer|peer

  local base_dir="${PWD}/../organizations"
  local dest_msp_dir
  if [ "$kind" = "orderer" ]; then
    dest_msp_dir="${base_dir}/ordererOrganizations/${org_domain}/msp"
  else
    dest_msp_dir="${base_dir}/peerOrganizations/${org_domain}/msp"
  fi

  # CA signing cert lấy từ kết quả enroll CA admin (đã có ở client-home)
  local ca_file="localhost-${port}-${ca_name}.pem"
  local src="${PWD}/../organizations/fabric-ca/${org}/msp/cacerts/${ca_file}"
  if [ ! -f "${src}" ]; then
    echo "!! Missing ${src}. Bạn đã chạy enroll_ca_admin cho ${org} chưa?"
    exit 1
  fi

  mkdir -p "${dest_msp_dir}/cacerts"
  cp -f "${src}" "${dest_msp_dir}/cacerts/${ca_file}"
  write_nodeou_config "${dest_msp_dir}" "${ca_file}"
}
# ---- END helpers ----

# Enroll CA admin of an org
enroll_ca_admin() {
  local org="$1"        # folder name under organizations/fabric-ca (ordererOrg|orgProp|orgTenant|orgLandlord)
  local port="$2"       # 10054|7054|8054|9054
  local ca_name="$3"    # ca-orderer-org|ca-orgprop|ca-orgtenant|ca-orglandlord

  echo "## Enrolling CA admin for ${org} at localhost:${port}"
  export FABRIC_CA_CLIENT_HOME="${PWD}/../organizations/fabric-ca/${org}"

  ${FABRIC_CA_CLIENT} enroll \
    -u "https://${CA_ADMIN}:${CA_ADMIN_PW}@localhost:${port}" \
    --caname "${ca_name}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
}

# Ensure affiliations exist: <org> and <org>.department1
ensure_affiliations() {
  local org="$1"
  local ca_name="$2"

  # FABRIC_CA_CLIENT_HOME already set by enroll_ca_admin for this org
  echo "## Ensuring affiliations for ${org} on ${ca_name}"
  ${FABRIC_CA_CLIENT} affiliation add "${org}" \
    --caname "${ca_name}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem" || true

  ${FABRIC_CA_CLIENT} affiliation add "${org}.department1" \
    --caname "${ca_name}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem" || true
}

# Register one identity (needs org to resolve TLS cert path)
register_identity() {
  local ca_name="$1"
  local id_name="$2"
  local id_secret="$3"
  local id_type="$4"
  local id_aff="$5"
  local attrs="$6"
  local org="$7"

  echo "Registering ${id_name} with ${ca_name} (type ${id_type}, affiliation ${id_aff}, attrs ${attrs})"

  # Nếu identity đã tồn tại thì bỏ qua
  if ${FABRIC_CA_CLIENT} identity list \
        --caname "${ca_name}" \
        --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem" 2>/dev/null \
      | grep -q "\"id\":\"${id_name}\""; then
    echo "→ ${id_name} already exists; skipping register."
    return 0
  fi

  # Thử register; nếu trả về 74 (already registered) thì cũng bỏ qua
  if ! ${FABRIC_CA_CLIENT} register \
        --caname "${ca_name}" \
        --id.name "${id_name}" \
        --id.secret "${id_secret}" \
        --id.type "${id_type}" \
        --id.attrs "${attrs}" \
        --id.affiliation "${id_aff}" \
        --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"; then
    rc=$?
    if [ "$rc" -eq 74 ]; then
      echo "→ ${id_name} already registered; continuing."
    else
      exit "$rc"
    fi
  fi
}



### ===== OrdererOrg =====
org="ordererOrg"
ca_name="ca-orderer-org"
enroll_ca_admin "${org}" 10054 "${ca_name}"
ensure_affiliations "${org}" "${ca_name}"
# ADD: tạo MSP cấp tổ chức cho OrdererOrg
prepare_org_msp "ordererOrg" "ordererorg.example.com" 10054 "ca-orderer-org" "orderer"
# Register identities
export FABRIC_CA_CLIENT_HOME="${PWD}/../organizations/fabric-ca/${org}"
register_identity "${ca_name}" "orderer1"        "orderer1pw"        "orderer" "${org}.department1" ""                         "${org}"
register_identity "${ca_name}" "ordererAdmin" "ordererAdminPW" "admin" "${org}.department1" \
"hf.Registrar.Roles=*,hf.Registrar.Attributes=*,hf.Revoker=true,hf.GenCRL=true,hf.AffiliationMgr=true" "${org}"

# Enroll orderers + TLS + Admin
for i in 1; do
  echo "## Enrolling Orderer${i}"
  MSP_DIR="${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer${i}.ordererorg.example.com/msp"
  if [ ! -f "${MSP_DIR}/signcerts/cert.pem" ]; then
    ${FABRIC_CA_CLIENT} enroll \
      -u "https://orderer${i}:orderer${i}pw@localhost:10054" \
      --caname "${ca_name}" \
      -M "${MSP_DIR}" \
      --csr.hosts "orderer${i}.ordererorg.example.com" \
      --csr.hosts "localhost" \
      --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  else
    echo "→ MSP for orderer${i} already exists; skipping enroll."
  fi

  # Copy CA cert & NodeOUs config
  mkdir -p "${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer${i}.ordererorg.example.com/msp/cacerts"
  cp "${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/msp/cacerts/"* \
     "${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer${i}.ordererorg.example.com/msp/cacerts/" || true
  cp "${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/msp/config.yaml" \
     "${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer${i}.ordererorg.example.com/msp/config.yaml"

  # Enroll TLS
  TLS_DIR="${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer${i}.ordererorg.example.com/tls"
  if [ ! -f "${TLS_DIR}/server.crt" ] || [ ! -f "${TLS_DIR}/server.key" ]; then
    ${FABRIC_CA_CLIENT} enroll \
      -u "https://orderer${i}:orderer${i}pw@localhost:10054" \
      --caname "${ca_name}" \
      -M "${TLS_DIR}" \
      --enrollment.profile tls \
      --csr.hosts "orderer${i}.ordererorg.example.com" \
      --csr.hosts "localhost" \
      --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"

    # Move TLS files to canonical names
    mv "${TLS_DIR}/keystore/"* "${TLS_DIR}/server.key"
    mv "${TLS_DIR}/signcerts/"* "${TLS_DIR}/server.crt"
    cp "${TLS_DIR}/tlscacerts/"* "${TLS_DIR}/ca.crt"
  else
    echo "→ TLS for orderer${i} already exists; skipping enroll."
  fi
done

echo "## Enrolling OrdererOrg Admin"
ADMIN_MSP_DIR="${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/users/Admin@ordererorg.example.com/msp"
if [ ! -f "${ADMIN_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://ordererAdmin:ordererAdminPW@localhost:10054" \
    --caname "${ca_name}" \
    -M "${ADMIN_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/ordererOrganizations/ordererorg.example.com/msp/config.yaml" \
     "${ADMIN_MSP_DIR}/config.yaml"
else
  echo "→ MSP for OrdererOrg Admin already exists; skipping enroll."
fi

### ===== OrgProp =====
org="orgProp"
ca_name="ca-orgprop"
enroll_ca_admin "${org}" 7054 "${ca_name}"
ensure_affiliations "${org}" "${ca_name}"
# ADD:
prepare_org_msp "orgProp" "orgprop.example.com" 7054 "ca-orgprop" "peer"
export FABRIC_CA_CLIENT_HOME="${PWD}/../organizations/fabric-ca/${org}"
register_identity "${ca_name}" "peer0"         "peer0pw"         "peer"   "${org}.department1" ""             "${org}"
register_identity "${ca_name}" "user1"         "user1pw"         "client" "${org}.department1" "role=landlord" "${org}"
register_identity "${ca_name}" "orgPropAdmin"  "orgPropAdminPW"  "admin"  "${org}.department1" ""             "${org}"

PEER_MSP_DIR="${PWD}/../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/msp"
if [ ! -f "${PEER_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://peer0:peer0pw@localhost:7054" \
    --caname "${ca_name}" \
    -M "${PEER_MSP_DIR}" \
    --csr.hosts "peer0.orgprop.example.com" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orgprop.example.com/msp/config.yaml" \
     "${PEER_MSP_DIR}/config.yaml"
else
  echo "→ MSP for peer0.orgprop already exists; skipping enroll."
fi

PEER_TLS_DIR="${PWD}/../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls"
if [ ! -f "${PEER_TLS_DIR}/server.crt" ] || [ ! -f "${PEER_TLS_DIR}/server.key" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://peer0:peer0pw@localhost:7054" \
    --caname "${ca_name}" \
    -M "${PEER_TLS_DIR}" \
    --enrollment.profile tls \
    --csr.hosts "peer0.orgprop.example.com" \
    --csr.hosts "localhost" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  mv "${PEER_TLS_DIR}/keystore/"* "${PEER_TLS_DIR}/server.key"
  mv "${PEER_TLS_DIR}/signcerts/"* "${PEER_TLS_DIR}/server.crt"
  cp "${PEER_TLS_DIR}/tlscacerts/"* "${PEER_TLS_DIR}/ca.crt"
else
  echo "→ TLS for peer0.orgprop already exists; skipping enroll."
fi

USER_MSP_DIR="${PWD}/../organizations/peerOrganizations/orgprop.example.com/users/User1@orgprop.example.com/msp"
if [ ! -f "${USER_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://user1:user1pw@localhost:7054" \
    --caname "${ca_name}" \
    -M "${USER_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orgprop.example.com/msp/config.yaml" \
     "${USER_MSP_DIR}/config.yaml"
else
  echo "→ MSP for User1@orgprop already exists; skipping enroll."
fi

ADMIN_MSP_DIR="${PWD}/../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp"
if [ ! -f "${ADMIN_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://orgPropAdmin:orgPropAdminPW@localhost:7054" \
    --caname "${ca_name}" \
    -M "${ADMIN_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orgprop.example.com/msp/config.yaml" \
     "${ADMIN_MSP_DIR}/config.yaml"
else
  echo "→ MSP for Admin@orgprop already exists; skipping enroll."
fi

### ===== OrgTenant =====
org="orgTenant"
ca_name="ca-orgtenant"
enroll_ca_admin "${org}" 8054 "${ca_name}"
ensure_affiliations "${org}" "${ca_name}"
# ADD:
prepare_org_msp "orgTenant" "orgtenant.example.com" 8054 "ca-orgtenant" "peer"
export FABRIC_CA_CLIENT_HOME="${PWD}/../organizations/fabric-ca/${org}"
register_identity "${ca_name}" "peer0"            "peer0pw"            "peer"   "${org}.department1" ""            "${org}"
register_identity "${ca_name}" "user1"            "user1pw"            "client" "${org}.department1" "role=tenant" "${org}"
register_identity "${ca_name}" "orgTenantAdmin"   "orgTenantAdminPW"   "admin"  "${org}.department1" ""            "${org}"

PEER_MSP_DIR="${PWD}/../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/msp"
if [ ! -f "${PEER_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://peer0:peer0pw@localhost:8054" \
    --caname "${ca_name}" \
    -M "${PEER_MSP_DIR}" \
    --csr.hosts "peer0.orgtenant.example.com" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orgtenant.example.com/msp/config.yaml" \
     "${PEER_MSP_DIR}/config.yaml"
else
  echo "→ MSP for peer0.orgtenant already exists; skipping enroll."
fi

PEER_TLS_DIR="${PWD}/../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls"
if [ ! -f "${PEER_TLS_DIR}/server.crt" ] || [ ! -f "${PEER_TLS_DIR}/server.key" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://peer0:peer0pw@localhost:8054" \
    --caname "${ca_name}" \
    -M "${PEER_TLS_DIR}" \
    --enrollment.profile tls \
    --csr.hosts "peer0.orgtenant.example.com" \
    --csr.hosts "localhost" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  mv "${PEER_TLS_DIR}/keystore/"* "${PEER_TLS_DIR}/server.key"
  mv "${PEER_TLS_DIR}/signcerts/"* "${PEER_TLS_DIR}/server.crt"
  cp "${PEER_TLS_DIR}/tlscacerts/"* "${PEER_TLS_DIR}/ca.crt"
else
  echo "→ TLS for peer0.orgtenant already exists; skipping enroll."
fi

USER_MSP_DIR="${PWD}/../organizations/peerOrganizations/orgtenant.example.com/users/User1@orgtenant.example.com/msp"
if [ ! -f "${USER_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://user1:user1pw@localhost:8054" \
    --caname "${ca_name}" \
    -M "${USER_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orgtenant.example.com/msp/config.yaml" \
     "${USER_MSP_DIR}/config.yaml"
else
  echo "→ MSP for User1@orgtenant already exists; skipping enroll."
fi

ADMIN_MSP_DIR="${PWD}/../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp"
if [ ! -f "${ADMIN_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://orgTenantAdmin:orgTenantAdminPW@localhost:8054" \
    --caname "${ca_name}" \
    -M "${ADMIN_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orgtenant.example.com/msp/config.yaml" \
     "${ADMIN_MSP_DIR}/config.yaml"
else
  echo "→ MSP for Admin@orgtenant already exists; skipping enroll."
fi

### ===== OrgLandlord =====
org="orgLandlord"
ca_name="ca-orglandlord"
enroll_ca_admin "${org}" 9054 "${ca_name}"
ensure_affiliations "${org}" "${ca_name}"
# ADD:
prepare_org_msp "orgLandlord" "orglandlord.example.com" 9054 "ca-orglandlord" "peer"
export FABRIC_CA_CLIENT_HOME="${PWD}/../organizations/fabric-ca/${org}"
register_identity "${ca_name}" "peer0"          "peer0pw"          "peer"   "${org}.department1" ""            "${org}"
register_identity "${ca_name}" "user1"          "user1pw"          "client" "${org}.department1" "role=landlord"  "${org}"
register_identity "${ca_name}" "orgLandlordAdmin"  "orgLandlordAdminPW"  "admin"  "${org}.department1" ""            "${org}"

PEER_MSP_DIR="${PWD}/../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/msp"
if [ ! -f "${PEER_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://peer0:peer0pw@localhost:9054" \
    --caname "${ca_name}" \
    -M "${PEER_MSP_DIR}" \
    --csr.hosts "peer0.orglandlord.example.com" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orglandlord.example.com/msp/config.yaml" \
     "${PEER_MSP_DIR}/config.yaml"
else
  echo "→ MSP for peer0.orglandlord already exists; skipping enroll."
fi

PEER_TLS_DIR="${PWD}/../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls"
if [ ! -f "${PEER_TLS_DIR}/server.crt" ] || [ ! -f "${PEER_TLS_DIR}/server.key" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://peer0:peer0pw@localhost:9054" \
    --caname "${ca_name}" \
    -M "${PEER_TLS_DIR}" \
    --enrollment.profile tls \
    --csr.hosts "peer0.orglandlord.example.com" \
    --csr.hosts "localhost" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  mv "${PEER_TLS_DIR}/keystore/"* "${PEER_TLS_DIR}/server.key"
  mv "${PEER_TLS_DIR}/signcerts/"* "${PEER_TLS_DIR}/server.crt"
  cp "${PEER_TLS_DIR}/tlscacerts/"* "${PEER_TLS_DIR}/ca.crt"
else
  echo "→ TLS for peer0.orglandlord already exists; skipping enroll."
fi

USER_MSP_DIR="${PWD}/../organizations/peerOrganizations/orglandlord.example.com/users/User1@orglandlord.example.com/msp"
if [ ! -f "${USER_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://user1:user1pw@localhost:9054" \
    --caname "${ca_name}" \
    -M "${USER_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orglandlord.example.com/msp/config.yaml" \
     "${USER_MSP_DIR}/config.yaml"
else
  echo "→ MSP for User1@orglandlord already exists; skipping enroll."
fi

ADMIN_MSP_DIR="${PWD}/../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp"
if [ ! -f "${ADMIN_MSP_DIR}/signcerts/cert.pem" ]; then
  ${FABRIC_CA_CLIENT} enroll \
    -u "https://orgLandlordAdmin:orgLandlordAdminPW@localhost:9054" \
    --caname "${ca_name}" \
    -M "${ADMIN_MSP_DIR}" \
    --tls.certfiles "${PWD}/../organizations/fabric-ca/${org}/tls-cert.pem"
  cp "${PWD}/../organizations/peerOrganizations/orglandlord.example.com/msp/config.yaml" \
     "${ADMIN_MSP_DIR}/config.yaml"
else
  echo "→ MSP for Admin@orglandlord already exists; skipping enroll."
fi

echo "Registration and enrollment completed for all orgs."
