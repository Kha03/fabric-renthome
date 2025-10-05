#!/bin/bash
# Script to verify admin access after certificates update

set -euo pipefail

CHANNEL_NAME="rentalchannel"
CHAINCODE_NAME="real-estate-cc"

echo "=== Verifying Admin Access After Certificate Update ==="
echo ""

# Function to test admin operations for an organization
test_org_admin() {
    local org_name=$1
    local msp_id=$2
    local peer_address=$3
    local tls_cert=$4
    local admin_msp=$5
    
    echo "Testing ${org_name} Admin Access..."
    
    export CORE_PEER_LOCALMSPID="${msp_id}"
    export CORE_PEER_TLS_ROOTCERT_FILE="${tls_cert}"
    export CORE_PEER_MSPCONFIGPATH="${admin_msp}"
    export CORE_PEER_ADDRESS="${peer_address}"
    
    # Test chaincode query
    if ../bin/peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c '{"function":"GetVersionInfo","Args":[]}' \
        --tls --cafile "../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/tlscacerts/tls-localhost-10054-ca-orderer-org.pem" >/dev/null 2>&1; then
        echo "   ✅ ${org_name}: Chaincode query successful"
    else
        echo "   ❌ ${org_name}: Chaincode query failed"
    fi
    
    # Test channel query
    if ../bin/peer channel getinfo -c ${CHANNEL_NAME} \
        --tls --cafile "../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/tlscacerts/tls-localhost-10054-ca-orderer-org.pem" >/dev/null 2>&1; then
        echo "   ✅ ${org_name}: Channel query successful"
    else
        echo "   ❌ ${org_name}: Channel query failed"
    fi
    
    echo ""
}

# Set environment
export FABRIC_CFG_PATH=../config
export CORE_PEER_TLS_ENABLED=true

echo "1. Testing OrgProp Admin..."
test_org_admin "OrgProp" \
    "OrgPropMSP" \
    "localhost:7051" \
    "../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt" \
    "../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp"

echo "2. Testing OrgLandlord Admin..."
test_org_admin "OrgLandlord" \
    "OrgLandlordMSP" \
    "localhost:9051" \
    "../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt" \
    "../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp"

echo "3. Testing OrgTenant Admin..."
test_org_admin "OrgTenant" \
    "OrgTenantMSP" \
    "localhost:8051" \
    "../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt" \
    "../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp"

echo "=== Verification Complete ==="
echo ""
echo "If all tests show ✅, admin certificates are working properly."
echo "If any test shows ❌, there may be additional configuration issues."
