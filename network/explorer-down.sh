#!/bin/bash
#
# Hyperledger Explorer Stop Script
# This script stops the Hyperledger Explorer and its database
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLORER_DIR="${SCRIPT_DIR}/../explorer"

echo "=========================================="
echo "Stopping Hyperledger Explorer"
echo "=========================================="

cd "${EXPLORER_DIR}"
docker compose -f docker-compose-explorer.yaml down

echo ""
echo "✓ Explorer stopped successfully"
echo ""
echo "To remove Explorer data (database volume), run:"
echo "  docker volume rm explorer_explorerdb"
echo "=========================================="
