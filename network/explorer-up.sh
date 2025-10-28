#!/bin/bash
#
# Hyperledger Explorer Start Script
# This script starts the Hyperledger Explorer and its database
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLORER_DIR="${SCRIPT_DIR}/../explorer"

echo "=========================================="
echo "Starting Hyperledger Explorer"
echo "=========================================="

# Check if network is running
if ! docker ps | grep -q "peer0.orgprop.example.com"; then
    echo "ERROR: Fabric network is not running!"
    echo "Please start the network first using network scripts"
    exit 1
fi

# Check if crypto materials exist
if [ ! -d "${SCRIPT_DIR}/../organizations/peerOrganizations" ]; then
    echo "ERROR: Crypto materials not found!"
    echo "Please generate the network artifacts first"
    exit 1
fi

echo "✓ Network is running"
echo "✓ Crypto materials found"
echo ""

# Prepare crypto materials - create symlinks for private keys
echo "Preparing crypto materials for Explorer..."
KEYSTORE_DIR="${SCRIPT_DIR}/../organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp/keystore"
PRIV_KEY=$(ls ${KEYSTORE_DIR}/*_sk 2>/dev/null | head -n 1)

if [ -n "$PRIV_KEY" ]; then
    # Create symlink with fixed name
    ln -sf "$(basename $PRIV_KEY)" "${KEYSTORE_DIR}/priv_sk"
    echo "✓ Private key symlink created"
else
    echo "ERROR: Private key not found in keystore"
    exit 1
fi

# Start Explorer
echo "Starting Explorer containers..."
cd "${EXPLORER_DIR}"
docker compose -f docker-compose-explorer.yaml up -d

# Wait for Explorer to initialize
echo ""
echo "Waiting for Explorer to initialize..."
sleep 20

# Add all peers to database
echo "Adding all peers to Explorer database..."
cd "${SCRIPT_DIR}"
./explorer-add-peers.sh

echo ""
echo "=========================================="
echo "Hyperledger Explorer Started Successfully!"
echo "=========================================="
echo ""
echo "Explorer URL: http://localhost:8080"
echo "Default credentials:"
echo "  Username: exploreradmin"
echo "  Password: exploreradminpw"
echo ""
echo "✅ All 3 peers are visible in Explorer UI"
echo ""
echo "To view logs:"
echo "  docker logs -f explorer.mynetwork.com"
echo ""
echo "To stop Explorer:"
echo "  ./explorer-down.sh"
echo "=========================================="
