#!/bin/bash

# Script to check monitoring stack status
# Author: Real Estate Network Team
# Usage: ./monitoring-status.sh

set -e

echo "=========================================="
echo "Monitoring Stack Status"
echo "=========================================="
echo ""

# Check Prometheus
if docker ps | grep -q "prometheus"; then
    echo "✅ Prometheus: RUNNING"
    PROMETHEUS_STATUS=$(curl -s http://localhost:9090/-/healthy 2>/dev/null || echo "unhealthy")
    if [ "$PROMETHEUS_STATUS" == "Prometheus is Healthy." ]; then
        echo "   Health: OK"
    else
        echo "   Health: Checking..."
    fi
    echo "   URL: http://localhost:9090"
else
    echo "❌ Prometheus: NOT RUNNING"
fi

echo ""

# Check Grafana
if docker ps | grep -q "grafana"; then
    echo "✅ Grafana: RUNNING"
    GRAFANA_STATUS=$(curl -s http://localhost:3002/api/health 2>/dev/null | grep -o '"database":"ok"' || echo "unhealthy")
    if [ "$GRAFANA_STATUS" == '"database":"ok"' ]; then
        echo "   Health: OK"
    else
        echo "   Health: Starting..."
    fi
    echo "   URL: http://localhost:3002"
else
    echo "❌ Grafana: NOT RUNNING"
fi

echo ""

# Check Node Exporter
if docker ps | grep -q "node-exporter"; then
    echo "✅ Node Exporter: RUNNING"
    echo "   URL: http://localhost:9100/metrics"
else
    echo "❌ Node Exporter: NOT RUNNING"
fi

echo ""

# Check cAdvisor
if docker ps | grep -q "cadvisor"; then
    echo "✅ cAdvisor: RUNNING"
    echo "   URL: http://localhost:8081"
else
    echo "❌ cAdvisor: NOT RUNNING"
fi

echo ""
echo "=========================================="
echo "Fabric Components Metrics Endpoints"
echo "=========================================="
echo ""

# Check Fabric peers
for PEER in "peer0.orgprop.example.com:9444" "peer0.orgtenant.example.com:9445" "peer0.orglandlord.example.com:9446"; do
    PEER_NAME=$(echo $PEER | cut -d: -f1)
    PEER_PORT=$(echo $PEER | cut -d: -f2)
    
    if docker ps | grep -q "$PEER_NAME"; then
        echo "✅ $PEER_NAME: RUNNING"
        METRICS=$(curl -s http://localhost:$PEER_PORT/metrics 2>/dev/null | head -n 1)
        if [ ! -z "$METRICS" ]; then
            echo "   Metrics: Available at http://localhost:$PEER_PORT/metrics"
        else
            echo "   Metrics: Not responding yet"
        fi
    else
        echo "❌ $PEER_NAME: NOT RUNNING"
    fi
done

echo ""

# Check Orderer
if docker ps | grep -q "orderer1.ordererorg.example.com"; then
    echo "✅ orderer1.ordererorg.example.com: RUNNING"
    METRICS=$(curl -s http://localhost:8443/metrics 2>/dev/null | head -n 1)
    if [ ! -z "$METRICS" ]; then
        echo "   Metrics: Available at http://localhost:8443/metrics"
    else
        echo "   Metrics: Not responding yet"
    fi
else
    echo "❌ orderer1.ordererorg.example.com: NOT RUNNING"
fi

echo ""
echo "=========================================="
echo "Prometheus Targets Status"
echo "=========================================="
echo ""

if docker ps | grep -q "prometheus"; then
    TARGETS=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null)
    if [ ! -z "$TARGETS" ]; then
        echo "Check detailed status at: http://localhost:9090/targets"
        
        # Count up/down targets
        UP_COUNT=$(echo "$TARGETS" | grep -o '"health":"up"' | wc -l)
        DOWN_COUNT=$(echo "$TARGETS" | grep -o '"health":"down"' | wc -l)
        
        echo "Targets UP: $UP_COUNT"
        echo "Targets DOWN: $DOWN_COUNT"
    else
        echo "Unable to fetch targets status"
    fi
else
    echo "Prometheus is not running"
fi

echo ""
echo "=========================================="
