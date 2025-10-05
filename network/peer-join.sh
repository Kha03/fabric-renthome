#!/bin/bash
set -euo pipefail

# Parse command line arguments
SKIP_ANCHOR_PEERS=false
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [OPTIONS]"
  echo
  echo "Join peers to channel and optionally update anchor peers"
  echo
  echo "OPTIONS:"
  echo "  --skip-anchor-peers    Skip anchor peer updates (useful when they fail)"
  echo "  --help, -h            Show this help message"
  echo
  echo "Examples:"
  echo "  $0                    # Join peers and update anchor peers"
  echo "  $0 --skip-anchor-peers # Only join peers, skip anchor updates"
  exit 0
fi

if [[ "${1:-}" == "--skip-anchor-peers" ]]; then
  SKIP_ANCHOR_PEERS=true
  echo "Note: Skipping anchor peer updates as requested"
fi

echo "=========================================="
echo "Fabric Real Estate Network - Peer Setup"
echo "=========================================="
echo "1. Joining peers to channel: rentalchannel"
if [ "$SKIP_ANCHOR_PEERS" = false ]; then
  echo "2. Updating anchor peers for all organizations"
else
  echo "2. Skipping anchor peer updates"
fi
echo "=========================================="

# === Locate repo root & export tool paths ===
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="${SCRIPT_DIR}/../bin:${PATH}"
export FABRIC_CFG_PATH="${SCRIPT_DIR}/../config"
export FABRIC_LOGGING_SPEC=INFO

# Set global BCCSP configuration
export CORE_PEER_BCCSP_DEFAULT=SW
export CORE_PEER_BCCSP_SW_HASH=SHA2
export CORE_PEER_BCCSP_SW_SECURITY=256
export CORE_PEER_BCCSP_SW_FILEKEYSTORE_KEYSTORE=${PWD}/../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp/keystore

# Sanity check
for cmd in peer configtxgen; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' not found in PATH. Expected in ${SCRIPT_DIR}/../bin" >&2
    exit 1
  fi
done

# Join peers to channel and update anchor peers
CHANNEL_NAME="rentalchannel"
BLOCK_FILE="../organizations/rentalchannel.genesis.block"
ORDERER_ADDR="localhost:7050"
ORDERER_TLS_CERT="../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt"
FABRIC_CFG_PATH=${PWD}/../config

# Function to join peer (given MSP and context)
joinPeer() {
  ORG_MSP=$1
  PEER_ADDR=$2
  MSP_CONFIG_PATH=$3
  TLS_ROOT_CERT=$4

  export CORE_PEER_LOCALMSPID=$ORG_MSP
  export CORE_PEER_MSPCONFIGPATH=$MSP_CONFIG_PATH
  export CORE_PEER_ADDRESS=$PEER_ADDR
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_TLS_ROOTCERT_FILE=$TLS_ROOT_CERT
  
  # BCCSP configuration with keystore path
  export CORE_PEER_BCCSP_DEFAULT=SW
  export CORE_PEER_BCCSP_SW_HASH=SHA2
  export CORE_PEER_BCCSP_SW_SECURITY=256
  export CORE_PEER_BCCSP_SW_FILEKEYSTORE_KEYSTORE=$MSP_CONFIG_PATH/keystore

  # Check if peer already joined the channel
  if peer channel list 2>/dev/null | grep -q "$CHANNEL_NAME"; then
    echo "Peer $PEER_ADDR ($ORG_MSP) already joined channel $CHANNEL_NAME, skipping..."
  else
    echo "Joining peer $PEER_ADDR ($ORG_MSP) to channel $CHANNEL_NAME..."
    peer channel join -b $BLOCK_FILE
  fi
}

# Join peers to channel
echo
echo "=== JOINING PEERS TO CHANNEL ==="
# OrgProp peer0 join
echo "Processing OrgProp peer..."
joinPeer "OrgPropMSP" "localhost:7051" "../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp" "../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt"

# OrgTenant peer0 join
echo "Processing OrgTenant peer..."
joinPeer "OrgTenantMSP" "localhost:8051" "../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp" "../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt"

# OrgLandlord peer0 join
echo "Processing OrgLandlord peer..."
joinPeer "OrgLandlordMSP" "localhost:9051" "../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp" "../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt"

# Generate anchor peer update tx for each org (only if not skipping)
if [ "$SKIP_ANCHOR_PEERS" = false ]; then
  echo
  echo "=== GENERATING ANCHOR PEER TRANSACTIONS ==="
  for org in OrgPropMSP OrgTenantMSP OrgLandlordMSP; do
    txFile="${org}anchors.tx"
    if [ -f "$txFile" ]; then
      echo "Anchor peer tx for $org already exists, skipping generation..."
    else
      echo "Generating anchor peer update tx for $org..."
      configtxgen -profile RentalChannel -outputAnchorPeersUpdate $txFile -channelID $CHANNEL_NAME -asOrg $org
    fi
  done

  # Update anchor peers (submit tx to channel)
  echo
  echo "=== UPDATING ANCHOR PEERS ==="
  for org in OrgPropMSP OrgTenantMSP OrgLandlordMSP; do
    txFile="${org}anchors.tx"
    echo "Updating anchor peers for $org..."
    # Use Org's admin context to update
    case $org in
      OrgPropMSP)
        export CORE_PEER_LOCALMSPID=OrgPropMSP
        export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp
        export CORE_PEER_ADDRESS=localhost:7051
        export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/tls/ca.crt
        ;;
      OrgTenantMSP)
        export CORE_PEER_LOCALMSPID=OrgTenantMSP
        export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orgtenant.example.com/users/Admin@orgtenant.example.com/msp
        export CORE_PEER_ADDRESS=localhost:8051
        export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orgtenant.example.com/peers/peer0.orgtenant.example.com/tls/ca.crt
        ;;
      OrgLandlordMSP)
        export CORE_PEER_LOCALMSPID=OrgLandlordMSP
        export CORE_PEER_MSPCONFIGPATH=../organizations/peerOrganizations/orglandlord.example.com/users/Admin@orglandlord.example.com/msp
        export CORE_PEER_ADDRESS=localhost:9051
        export CORE_PEER_TLS_ROOTCERT_FILE=../organizations/peerOrganizations/orglandlord.example.com/peers/peer0.orglandlord.example.com/tls/ca.crt
        ;;
    esac
    # Set BCCSP configuration for anchor peer update
    export CORE_PEER_BCCSP_DEFAULT=SW
    export CORE_PEER_BCCSP_SW_HASH=SHA2
    export CORE_PEER_BCCSP_SW_SECURITY=256
    export CORE_PEER_BCCSP_SW_FILEKEYSTORE_KEYSTORE=$CORE_PEER_MSPCONFIGPATH/keystore
    
    peer channel update -o $ORDERER_ADDR --ordererTLSHostnameOverride orderer1.ordererorg.example.com -c $CHANNEL_NAME -f ${org}anchors.tx --tls --cafile $ORDERER_TLS_CERT
  done
fi

echo "=========================================="
echo "✅ Peer setup completed successfully!"
echo "✅ All peers joined channel: $CHANNEL_NAME"
if [ "$SKIP_ANCHOR_PEERS" = false ]; then
  echo "✅ Anchor peers updated for all organizations"
else
  echo "ℹ️  Anchor peer updates were skipped"
fi
echo "=========================================="
