#!/bin/bash

# Script to start the entire Fabric network stack:
# 1. Fabric network (Peers, Orderers, CAs) via docker-compose
# 2. Hyperledger Explorer
# 3. Monitoring Stack (Prometheus, Grafana)
#
# Author: Real Estate Network Team
# Usage: ./start-all.sh

set -e

# Move to the script's directory to ensure other scripts are found
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "===================================================="
echo "    STARTING THE COMPLETE FABRIC NETWORK STACK"
echo "===================================================="
echo ""

# 1. Start the core Fabric network
echo "--> 1. Starting Core Fabric Network (Peers, Orderers, CouchDB)..."
if [ -f "../docker/docker-compose.yaml" ]; then
    docker compose -f ../docker/docker-compose.yaml up -d
    echo "✅ Core Fabric Network startup initiated."
else
    echo "❌ Error: ../docker/docker-compose.yaml not found. Cannot start core network."
    exit 1
fi
echo ""

# Give some time for the network to initialize before starting dependent services
echo "⏳ Waiting 15 seconds for the network to stabilize..."
sleep 15
echo ""

# 2. Start Hyperledger Explorer
echo "--> 2. Starting Hyperledger Explorer..."
if [ -f "./explorer-up.sh" ]; then
    ./explorer-up.sh
else
    echo "⚠️ Warning: explorer-up.sh not found. Skipping Explorer."
fi
echo ""

# 3. Start Monitoring Stack
echo "--> 3. Starting Monitoring Stack..."
if [ -f "./monitoring-up.sh" ]; then
    ./monitoring-up.sh
else
    echo "⚠️ Warning: monitoring-up.sh not found. Skipping Monitoring."
fi
echo ""

echo "===================================================="
echo "      ALL SERVICES STARTUP PROCESS INITIATED"
echo "===================================================="
echo ""
echo "Use 'docker ps' to check the status of all containers."
echo "It might take a few minutes for all services to be fully available."
echo ""
echo "Access URLs:"
echo "  - Fabric Explorer: http://localhost:8090"
echo "  - Grafana:         http://localhost:3002"
echo "  - Prometheus:      http://localhost:9090"
echo ""

