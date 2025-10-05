#!/bin/bash
set -euo pipefail
COMPOSE_FILE="../docker/docker-compose.yaml"

# NEW: generate TLS cert/key for each CA if missing
./ca-tls-gen.sh

echo "Starting Fabric CAs..."
docker-compose -f $COMPOSE_FILE up -d \
  ca.ordererorg.example.com \
  ca.orgprop.example.com \
  ca.orgtenant.example.com \
  ca.orglandlord.example.com

echo "Waiting for CA containers to start..."
sleep 3
docker ps -f "name=ca." --format "table {{.Names}}\t{{.Status}}"
