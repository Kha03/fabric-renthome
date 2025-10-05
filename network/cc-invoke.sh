#!/bin/bash
# Invoke a chaincode transaction
CHANNEL_NAME="rentalchannel"
CC_NAME="real-estate-cc"
FUNC="$1"
shift
ARGS=("$@")
if [ -z "$FUNC" ]; then
  echo "Usage: cc-invoke.sh <function> [args...]"
  exit 1
fi

# Use OrgProp peer by default for invocation (ensuring we get an endorsement from one peer in each org)
export CORE_PEER_LOCALMSPID=OrgPropMSP
export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt

PEER_CONN_ARGS="--peerAddresses localhost:7051 --tlsRootCertFiles ../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt \
--peerAddresses localhost:8051 --tlsRootCertFiles ../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt \
--peerAddresses localhost:9051 --tlsRootCertFiles ../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt"

echo "Invoking function '${FUNC}' with args [${ARGS[*]}]"
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer1.ordererorg.example.com -C $CHANNEL_NAME -n $CC_NAME $PEER_CONN_ARGS --tls --cafile ../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt -c "{\"function\":\"${FUNC}\",\"Args\":[\"${ARGS[@]}\"]}"
