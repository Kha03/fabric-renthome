#!/bin/bash
# Script to update admin certificates in channel configuration
# Based on ADMIN_CERTIFICATES_FIX.md documentation

set -euo pipefail

CHANNEL_NAME="rentalchannel"
ORDERER_URL="localhost:7050"
ORDERER_CA="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/tlscacerts/tls-localhost-10054-ca-orderer-org.pem"

echo "=== Updating Admin Certificates in Channel Configuration ==="
echo "Channel: ${CHANNEL_NAME}"
echo ""

# Set environment for OrgProp
export FABRIC_CFG_PATH=../config
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="OrgPropMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"

echo "1. Fetching current channel configuration..."
../bin/peer channel fetch config config_block.pb -c ${CHANNEL_NAME} \
  --orderer ${ORDERER_URL} \
  --tls --cafile "${ORDERER_CA}"

echo "2. Decoding configuration block..."
../bin/configtxlator proto_decode \
  --input config_block.pb \
  --type common.Block | jq .data.data[0].payload.data.config > config.json

echo "3. Creating backup of original configuration..."
cp config.json config_backup.json

echo "4. Extracting admin certificates from filesystem..."

# Extract and encode admin certificates
ORGPROP_ADMIN_CERT=$(base64 -w 0 ../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp/signcerts/cert.pem)
ORGLANDLORD_ADMIN_CERT=$(base64 -w 0 ../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp/signcerts/cert.pem)
ORGTENANT_ADMIN_CERT=$(base64 -w 0 ../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp/signcerts/cert.pem)

echo "   ✅ OrgProp admin certificate encoded"
echo "   ✅ OrgLandlord admin certificate encoded"
echo "   ✅ OrgTenant admin certificate encoded"

echo "5. Updating MSP configuration..."

# Update OrgPropMSP
jq --arg cert "${ORGPROP_ADMIN_CERT}" \
  '.channel_group.groups.Application.groups.OrgPropMSP.values.MSP.value.config.admins = [$cert]' \
  config.json > config_temp1.json

# Update OrgLandlordMSP
jq --arg cert "${ORGLANDLORD_ADMIN_CERT}" \
  '.channel_group.groups.Application.groups.OrgLandlordMSP.values.MSP.value.config.admins = [$cert]' \
  config_temp1.json > config_temp2.json

# Update OrgTenantMSP
jq --arg cert "${ORGTENANT_ADMIN_CERT}" \
  '.channel_group.groups.Application.groups.OrgTenantMSP.values.MSP.value.config.admins = [$cert]' \
  config_temp2.json > modified_config.json

# Cleanup temp files
rm config_temp1.json config_temp2.json

echo "   ✅ MSP configurations updated for all organizations"

echo "6. Encoding modified configuration..."
../bin/configtxlator proto_encode \
  --input modified_config.json \
  --type common.Config \
  --output modified_config.pb

echo "7. Encoding original configuration..."
../bin/configtxlator proto_encode \
  --input config.json \
  --type common.Config \
  --output config.pb

echo "8. Computing configuration update..."
../bin/configtxlator compute_update \
  --channel_id ${CHANNEL_NAME} \
  --original config.pb \
  --updated modified_config.pb \
  --output config_update.pb

echo "9. Decoding configuration update..."
../bin/configtxlator proto_decode \
  --input config_update.pb \
  --type common.ConfigUpdate | jq . > config_update.json

echo "10. Creating configuration update envelope..."
echo '{"payload":{"header":{"channel_header":{"channel_id":"'${CHANNEL_NAME}'","type":2}},"data":{"config_update":'$(cat config_update.json)'}}}' | jq . > config_update_in_envelope.json

../bin/configtxlator proto_encode \
  --input config_update_in_envelope.json \
  --type common.Envelope \
  --output config_update_in_envelope.pb

echo "11. Signing configuration update with OrgProp admin..."
../bin/peer channel signconfigtx -f config_update_in_envelope.pb

echo "12. Switching to OrgLandlord for signing..."
export CORE_PEER_LOCALMSPID="OrgLandlordMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp"
export CORE_PEER_ADDRESS="localhost:9051"

echo "13. Signing configuration update with OrgLandlord admin..."
../bin/peer channel signconfigtx -f config_update_in_envelope.pb

echo "14. Switching to OrgTenant for signing..."
export CORE_PEER_LOCALMSPID="OrgTenantMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp"
export CORE_PEER_ADDRESS="localhost:11051"

echo "15. Submitting configuration update transaction..."
../bin/peer channel update \
  -f config_update_in_envelope.pb \
  -c ${CHANNEL_NAME} \
  --orderer ${ORDERER_URL} \
  --tls --cafile "${ORDERER_CA}"

echo "16. Verifying update..."
sleep 3

# Switch back to OrgProp for verification
export CORE_PEER_LOCALMSPID="OrgPropMSP"
export CORE_PEER_TLS_ROOTCERT_FILE="../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"

# Fetch updated configuration
../bin/peer channel fetch config verification_config_block.pb -c ${CHANNEL_NAME} \
  --orderer ${ORDERER_URL} \
  --tls --cafile "${ORDERER_CA}"

../bin/configtxlator proto_decode \
  --input verification_config_block.pb \
  --type common.Block | jq .data.data[0].payload.data.config > verification_config.json

echo ""
echo "=== Verification Results ==="
echo "OrgPropMSP admin certificates: $(jq '.channel_group.groups.Application.groups.OrgPropMSP.values.MSP.value.config.admins | length' verification_config.json)"
echo "OrgLandlordMSP admin certificates: $(jq '.channel_group.groups.Application.groups.OrgLandlordMSP.values.MSP.value.config.admins | length' verification_config.json)"
echo "OrgTenantMSP admin certificates: $(jq '.channel_group.groups.Application.groups.OrgTenantMSP.values.MSP.value.config.admins | length' verification_config.json)"

echo ""
echo "=== Cleanup temporary files ==="
rm -f config_block.pb modified_config.pb config.pb config_update.pb config_update.json config_update_in_envelope.json config_update_in_envelope.pb verification_config_block.pb

echo ""
echo "✅ Admin certificates update completed successfully!"
echo ""
echo "Files created:"
echo "  - config_backup.json (original configuration backup)"
echo "  - modified_config.json (updated configuration)"
echo "  - verification_config.json (post-update configuration)"
echo ""
echo "All admin operations should now work properly."
