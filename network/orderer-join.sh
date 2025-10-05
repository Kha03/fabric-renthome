#!/bin/bash
# Join orderer nodes to the channel using osnadmin
CHANNEL_NAME="rentalchannel"
GENESIS_BLOCK="../organizations/rentalchannel.genesis.block"
ORDERER_CA_CERT="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt"
# Using orderer admin TLS cert for client authentication  
ORDERER_TLS_CERT="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/server.crt"
ORDERER_TLS_KEY="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/server.key"

for ord in 1 2 3; do
  adminPort=""
  case $ord in
    1) adminPort=7053 ;;
    2) adminPort=8053 ;;
    3) adminPort=9053 ;;
  esac
  echo "Joining orderer${ord} to channel ${CHANNEL_NAME}..."
  ../bin/osnadmin channel join --channelID ${CHANNEL_NAME} --config-block ${GENESIS_BLOCK} -o localhost:${adminPort} \
    --ca-file "${ORDERER_CA_CERT}" --client-cert "${ORDERER_TLS_CERT}" --client-key "${ORDERER_TLS_KEY}"
done

# Optionally list channels joined for verification
echo "Listing channels for orderer1:"
../bin/osnadmin channel list -o localhost:7053 --ca-file "${ORDERER_CA_CERT}" --client-cert "${ORDERER_TLS_CERT}" --client-key "${ORDERER_TLS_KEY}"
