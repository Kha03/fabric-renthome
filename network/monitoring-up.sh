#!/bin/bash

# Script to start Prometheus and Grafana monitoring stack
# Author: Real Estate Network Team
# Usage: ./monitoring-up.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="$SCRIPT_DIR/../monitoring"

echo "=========================================="
echo "Starting Monitoring Stack"
echo "=========================================="

# Check if Fabric network is running
if ! docker ps | grep -q "peer0.orgprop.example.com"; then
    echo "⚠️  Warning: Fabric network doesn't seem to be running"
    echo "   Please start the network first with ./network scripts"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Change to monitoring directory
cd "$MONITORING_DIR"

echo ""
echo "📊 Starting Prometheus and Grafana..."
docker compose -f docker-compose-monitoring.yaml up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker ps | grep -q "prometheus"; then
    echo "✅ Prometheus is running"
else
    echo "❌ Prometheus failed to start"
    exit 1
fi

if docker ps | grep -q "grafana"; then
    echo "✅ Grafana is running"
else
    echo "❌ Grafana failed to start"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Monitoring Stack Started Successfully"
echo "=========================================="
echo ""
echo "Access URLs:"
echo "  📊 Prometheus: http://localhost:9090"
echo "  📈 Grafana:    http://localhost:3002"
echo ""
echo "Grafana Credentials:"
echo "  Username: admin"
echo "  Password: admin"
echo ""
echo "Additional Monitoring:"
echo "  🔍 Node Exporter: http://localhost:9100/metrics"
echo "  📦 cAdvisor:      http://localhost:8081"
echo ""
echo "To view logs:"
echo "  docker logs prometheus"
echo "  docker logs grafana"
echo ""
echo "To stop:"
echo "  ./monitoring-down.sh"
echo "=========================================="
