#!/bin/bash

# Script to stop Prometheus and Grafana monitoring stack
# Author: Real Estate Network Team
# Usage: ./monitoring-down.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="$SCRIPT_DIR/../monitoring"

echo "=========================================="
echo "Stopping Monitoring Stack"
echo "=========================================="

cd "$MONITORING_DIR"

echo ""
echo "🛑 Stopping Prometheus and Grafana..."
docker compose -f docker-compose-monitoring.yaml down

echo ""
echo "✅ Monitoring Stack Stopped"
echo ""
echo "Note: Data volumes are preserved."
echo "To remove all data, run:"
echo "  docker compose -f monitoring/docker-compose-monitoring.yaml down -v"
echo "=========================================="
