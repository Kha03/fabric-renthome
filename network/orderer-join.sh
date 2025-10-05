#!/bin/bash
# Join orderer nodes to the channel using osnadmin
CHANNEL_NAME="rentalchannel"
GENESIS_BLOCK="../organizations/rentalchannel.genesis.block"
ORDERER_CA_CERT="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt"
# Using orderer admin TLS cert for client authentication  
ORDERER_TLS_CERT="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/server.crt"
ORDERER_TLS_KEY="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/server.key"

# Join only orderer1 (we reduced from 3 to 1 orderer)
echo "Joining orderer1 to channel ${CHANNEL_NAME}..."
../bin/osnadmin channel join --channelID ${CHANNEL_NAME} --config-block ${GENESIS_BLOCK} -o localhost:9443 \
  --ca-file "${ORDERER_CA_CERT}" --client-cert "${ORDERER_TLS_CERT}" --client-key "${ORDERER_TLS_KEY}"

# List channels joined for verification
echo "Listing channels for orderer1:"
../bin/osnadmin channel list -o localhost:9443 --ca-file "${ORDERER_CA_CERT}" --client-cert "${ORDERER_TLS_CERT}" --client-key "${ORDERER_TLS_KEY}"
