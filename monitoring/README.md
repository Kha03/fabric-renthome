# Monitoring Stack for Hyperledger Fabric Real Estate Network

This directory contains the monitoring stack configuration for the Hyperledger Fabric network using Prometheus and Grafana.

## Components

- **Prometheus**: Time-series database for metrics collection
- **Grafana**: Visualization and dashboarding
- **Node Exporter**: Host system metrics
- **cAdvisor**: Container metrics

## Quick Start

### Start Monitoring Stack

```bash
cd network
./monitoring-up.sh
```

### Access Services

- **Grafana**: http://localhost:3002
  - Username: `admin`
  - Password: `admin`
  
- **Prometheus**: http://localhost:9090

- **Node Exporter**: http://localhost:9100/metrics

- **cAdvisor**: http://localhost:8081

### Check Status

```bash
./monitoring-status.sh
```

### Stop Monitoring Stack

```bash
./monitoring-down.sh
```

## Metrics Collected

### Peer Metrics

- **Ledger Metrics**
  - `ledger_blockchain_height`: Current block height
  - `ledger_transaction_count`: Total transactions
  
- **Endorsement Metrics**
  - `endorser_proposals_received`: Number of proposals received
  - `endorser_proposal_duration`: Time to process endorsement
  - `endorser_proposal_validation_failures`: Failed endorsements
  
- **Chaincode Metrics**
  - `chaincode_launch_duration`: Time to launch chaincode
  - `chaincode_launch_failures`: Failed chaincode launches
  
- **System Metrics**
  - `process_cpu_seconds_total`: CPU usage
  - `process_resident_memory_bytes`: Memory usage
  - `go_goroutines`: Number of goroutines

### Orderer Metrics

- **Consensus Metrics**
  - `consensus_etcdraft_committed_block_number`: Blocks committed
  - `consensus_etcdraft_is_leader`: Leader status
  
- **Broadcast Metrics**
  - `broadcast_processed_count`: Transactions processed
  - `broadcast_validate_duration`: Validation time

### CouchDB Metrics

- HTTP request metrics
- Database operations
- Active connections

## Grafana Dashboards

### Hyperledger Fabric Overview

Default dashboard showing:
- Block height across all peers
- Endorsement proposal rates
- Peer and orderer health status
- CPU and memory usage
- Endorsement failures
- Endorsement duration (p95)
- Go goroutines

## Alerts

Configured alerts in `alerts.yml`:

### Critical Alerts
- `PeerDown`: Peer unavailable for 2+ minutes
- `OrdererDown`: Orderer unavailable for 2+ minutes
- `ChaincodeInstantiationFailure`: Chaincode failed to launch
- `CouchDBDown`: Database unavailable

### Warning Alerts
- `PeerHighCPU`: CPU usage > 80% for 5 minutes
- `PeerHighMemory`: Memory usage > 2GB
- `LedgerHeightStale`: No new blocks for 15 minutes
- `HighEndorsementFailureRate`: >10% failures
- `LowDiskSpace`: <10% disk remaining

## Configuration Files

```
monitoring/
├── prometheus.yml              # Prometheus config with scrape targets
├── alerts.yml                  # Alert rules
├── docker-compose-monitoring.yaml  # Docker compose for stack
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   └── prometheus.yml  # Auto-configure Prometheus datasource
    │   └── dashboards/
    │       └── dashboards.yml  # Auto-load dashboards
    └── dashboards/
        └── fabric-overview.json  # Main Fabric dashboard
```

## Fabric Metrics Endpoints

After starting the network with metrics enabled:

- **OrgProp Peer**: http://localhost:9444/metrics
- **OrgTenant Peer**: http://localhost:9445/metrics
- **OrgLandlord Peer**: http://localhost:9446/metrics
- **Orderer**: http://localhost:8443/metrics

## Customization

### Add New Metrics Target

Edit `monitoring/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'my-service'
    static_configs:
      - targets: ['my-service:port']
```

### Create Custom Dashboard

1. Access Grafana at http://localhost:3002
2. Create new dashboard
3. Add panels with Prometheus queries
4. Export JSON and save to `grafana/dashboards/`

### Add Custom Alerts

Edit `monitoring/alerts.yml`:

```yaml
- alert: MyAlert
  expr: my_metric > threshold
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Alert description"
```

## Troubleshooting

### Metrics Not Showing

1. Check Fabric components are running with metrics enabled:
   ```bash
   docker logs peer0.orgprop.example.com | grep -i metrics
   ```

2. Verify metrics endpoint is accessible:
   ```bash
   curl http://localhost:9444/metrics
   ```

3. Check Prometheus targets status:
   - Go to http://localhost:9090/targets
   - All targets should show "UP" status

### Grafana Dashboard Not Loading

1. Check datasource configuration:
   - Grafana → Configuration → Data Sources
   - Test connection to Prometheus

2. Verify dashboard files exist:
   ```bash
   ls -la monitoring/grafana/dashboards/
   ```

### High Resource Usage

1. Reduce scrape interval in `prometheus.yml`:
   ```yaml
   global:
     scrape_interval: 30s  # Increase from 15s
   ```

2. Reduce retention period:
   ```yaml
   command:
     - '--storage.tsdb.retention.time=15d'  # Reduce from 30d
   ```

## Production Recommendations

1. **Enable TLS for metrics endpoints**
   - Configure proper certificates
   - Update Prometheus scrape configs with TLS settings

2. **Set up AlertManager**
   - Configure email/Slack notifications
   - Define alert routing rules

3. **Implement Access Control**
   - Enable authentication on Prometheus
   - Use strong Grafana passwords
   - Restrict metrics endpoint access

4. **Data Retention**
   - Adjust based on compliance requirements
   - Consider long-term storage solutions

5. **High Availability**
   - Deploy multiple Prometheus instances
   - Use remote storage backends
   - Set up Grafana clustering

## Resources

- [Hyperledger Fabric Metrics](https://hyperledger-fabric.readthedocs.io/en/latest/operations_service.html)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
