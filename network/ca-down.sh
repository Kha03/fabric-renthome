#!/bin/bash
# Stop Fabric CA containers
COMPOSE_FILE="../docker/docker-compose.yaml"
echo "Stopping Fabric CA containers..."
docker-compose -f $COMPOSE_FILE stop ca.ordererorg.example.com ca.orgprop.example.com ca.orgtenant.example.com ca.orglandlord.example.com
docker-compose -f $COMPOSE_FILE rm -f ca.ordererorg.example.com ca.orgprop.example.com ca.orgtenant.example.com ca.orglandlord.example.com
