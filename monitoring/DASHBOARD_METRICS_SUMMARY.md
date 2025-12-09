# Dashboard Monitoring Metrics - Hyperledger Fabric Real Estate Network

## Tổng quan
Dashboard Grafana giám sát hiệu suất và sức khỏe của mạng Hyperledger Fabric với 14 panels chính, thu thập dữ liệu trong time window 30 phút, refresh mỗi 10 giây.

---

## 1. Ledger Block Height
**Công thức:** 
```promql
ledger_blockchain_height
```

**Chức năng:** Hiển thị chiều cao blockchain (số blocks) của từng peer và orderer

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Theo dõi đồng bộ giữa các nodes
- Phát hiện peer bị tụt hậu (lag)
- Xác nhận blocks được tạo liên tục

---

## 2. Peer Status
**Công thức:** 
```promql
up{job=~"peer-.*"}
```

**Chức năng:** Hiển thị trạng thái UP (1) hoặc DOWN (0) của các peers

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Monitor availability của peer nodes
- Cảnh báo khi peer offline
- SLA monitoring

---

## 3. Transaction Rate
**Công thức:** 
```promql
rate(endorser_proposal_duration_count{chaincode="real-estate-cc"}[30m])
```

**Chức năng:** Số transactions/giây được xử lý (chỉ business transactions)

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Đo throughput hệ thống
- Phát hiện traffic cao hoặc thấp bất thường
- Capacity planning

---

## 4. Endorsement Failures
**Công thức:** 
```promql
rate(endorser_proposal_validation_failures[30m])
```

**Chức năng:** Tỷ lệ endorsement thất bại

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Phát hiện lỗi validation
- Endorsement policy không đạt
- Chaincode errors

---

## 5. Transaction Latency (p50/p95/p99)
**Công thức:** 
```promql
histogram_quantile(0.50, rate(endorser_proposal_duration_bucket{chaincode="real-estate-cc"}[30m]))
histogram_quantile(0.95, rate(endorser_proposal_duration_bucket{chaincode="real-estate-cc"}[30m]))
histogram_quantile(0.99, rate(endorser_proposal_duration_bucket{chaincode="real-estate-cc"}[30m]))
```

**Chức năng:** Thời gian xử lý endorsement ở các percentiles

**Loại:** Timeseries graph

**Ý nghĩa:** 
- **p50 (median):** Latency điển hình - 50% transactions nhanh hơn giá trị này
- **p95:** SLA monitoring - 95% transactions đáp ứng trong thời gian này
- **p99:** Worst-case detection - chỉ 1% transactions chậm hơn

**Giá trị điển hình:**
- p50: ~20-50ms
- p95: ~40-100ms
- p99: ~100-200ms

---

## 6. Business Transactions by Organization
**Công thức:** 
```promql
sum by(org) (increase(endorser_proposal_duration_count{chaincode="real-estate-cc"}[30m]))
```

**Chức năng:** Phân bố số lượng transactions theo từng organization

**Loại:** Pie chart

**Ý nghĩa:** 
- Xem org nào active nhất
- Phát hiện bất thường trong usage
- Business analytics

---

## 7. Average Transaction Latency by Chaincode
**Công thức:** 
```promql
rate(endorser_proposal_duration_sum{chaincode="real-estate-cc"}[30m]) / 
rate(endorser_proposal_duration_count{chaincode="real-estate-cc"}[30m])
```

**Chức năng:** Latency trung bình theo chaincode

**Loại:** Timeseries graph

**Ý nghĩa:** 
- So sánh hiệu suất giữa các chaincodes
- Theo dõi xu hướng latency theo thời gian
- Benchmark performance

---

## 8. Current Transaction Latency
**Công thức:** 
```promql
(rate(endorser_proposal_duration_sum{chaincode="real-estate-cc"}[30m]) / 
 rate(endorser_proposal_duration_count{chaincode="real-estate-cc"}[30m]))
```

**Chức năng:** Latency hiện tại của từng peer (real-time view)

**Loại:** Stat panels (số to với màu)

**Ý nghĩa:** 
- At-a-glance view của hiệu suất
- Cảnh báo nhanh khi có vấn đề
- So sánh giữa các peers

**Threshold:**
- 🟢 Green: < 100ms
- 🟡 Yellow: 100-500ms
- 🔴 Red: > 500ms

---

## 9. Block Creation Time (p50)
**Công thức:** 
```promql
histogram_quantile(0.50, rate(blockcutter_block_fill_duration_bucket{channel="rentalchannel"}[30m]))
```

**Chức năng:** Thời gian orderer đợi để tạo block (median)

**Loại:** Gauge

**Ý nghĩa:** 
- Đo delay từ BatchTimeout (cấu hình 2s)
- Phát hiện orderer chậm
- Xác định có cần giảm BatchTimeout không

**Threshold:**
- 🟢 Green: < 1s
- 🟡 Yellow: 1-3s
- 🔴 Red: > 3s

**Giá trị điển hình:** ~1.75s (với BatchTimeout=2s, MaxMessageCount=10)

---

## 10. Block Creation Latency (Orderer)
**Công thức:** 
```promql
histogram_quantile(0.50, rate(blockcutter_block_fill_duration_bucket{channel="rentalchannel"}[30m]))
histogram_quantile(0.95, rate(blockcutter_block_fill_duration_bucket{channel="rentalchannel"}[30m]))
histogram_quantile(0.99, rate(blockcutter_block_fill_duration_bucket{channel="rentalchannel"}[30m]))
```

**Chức năng:** Phân tích chi tiết thời gian tạo block với nhiều percentiles

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Xem block có tạo đều đặn hay có spike
- Phát hiện bottleneck ở orderer
- Verify BatchTimeout configuration

**Giải thích giá trị:**
- p50 < 2s: Có transactions đủ để cắt block sớm (MaxMessageCount đạt)
- p95 ≈ 2s: Đa số blocks đợi đủ BatchTimeout
- p99 > 2s: Một số blocks bị delay do system load

---

## 11. Block Commit Time (Peers)
**Công thức:** 
```promql
histogram_quantile(0.50, rate(gossip_privdata_commit_block_duration_bucket{channel="rentalchannel"}[30m]))
histogram_quantile(0.95, rate(gossip_privdata_commit_block_duration_bucket{channel="rentalchannel"}[30m]))
```

**Chức năng:** Thời gian peers commit block vào ledger

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Đo hiệu suất CouchDB write
- Phát hiện peer chậm commit
- Database performance monitoring

**Giá trị điển hình:**
- p50: ~100-200ms
- p95: ~150-300ms

**Các giai đoạn trong commit:**
1. Validate transactions
2. Write to CouchDB state database
3. Update block storage
4. Update indexes

---

## 12. End-to-End Transaction Latency (p95) ⭐
**Công thức:** 
```promql
avg(histogram_quantile(0.95, rate(endorser_proposal_duration_bucket{chaincode="real-estate-cc"}[30m]))) +
avg(histogram_quantile(0.95, rate(blockcutter_block_fill_duration_bucket{channel="rentalchannel"}[30m]))) +
avg(histogram_quantile(0.95, rate(gossip_privdata_commit_block_duration_bucket{channel="rentalchannel"}[30m])))
```

**Chức năng:** Tổng latency từ proposal → committed (KPI chính)

**Loại:** Bar gauge với màu cảnh báo

**Ý nghĩa:** 
- **KPI chính** cho user experience
- SLA monitoring end-to-end
- Tổng hợp toàn bộ transaction flow

**Threshold:**
- 🟢 Green: < 2s
- 🟡 Yellow: 2-4s
- 🔴 Red: > 4s

**Breakdown điển hình (với BatchTimeout=2s):**
- Endorsement: ~50ms (2%)
- Block Creation: ~2000ms (90%) ← **Bottleneck chính**
- Block Commit: ~150ms (8%)
- **Total: ~2.2s**

---

## 13. Transaction Flow Breakdown (p50)
**Công thức:** Stacked graph với 3 layers:

**Layer 1 - Endorsement:**
```promql
avg(histogram_quantile(0.50, rate(endorser_proposal_duration_bucket{chaincode="real-estate-cc"}[30m])))
```

**Layer 2 - Block Creation:**
```promql
avg(histogram_quantile(0.50, rate(blockcutter_block_fill_duration_bucket{channel="rentalchannel"}[30m])))
```

**Layer 3 - Block Commit:**
```promql
avg(histogram_quantile(0.50, rate(gossip_privdata_commit_block_duration_bucket{channel="rentalchannel"}[30m])))
```

**Chức năng:** Phân tích visual từng giai đoạn của transaction flow

**Loại:** Stacked area chart

**Ý nghĩa:** 
- Xác định bottleneck trong pipeline
- Visualize contribution của từng phase
- Hiểu rõ transaction journey

**Các giai đoạn:**
1. **🟢 Endorsement** (~50ms)
   - Client gửi proposal tới peers
   - Peers thực thi chaincode
   - Peers ký và trả response

2. **🟡 Block Creation** (~1.75s) ← **Chiếm phần lớn**
   - Orderer nhận transaction
   - Đợi BatchTimeout hoặc MaxMessageCount
   - Cắt block và broadcast

3. **🔵 Block Commit** (~150ms)
   - Peers nhận block từ orderer
   - Validate transactions
   - Write to ledger & state DB

---

## 14. Chaincode Execution Time (p95)
**Công thức:** 
```promql
histogram_quantile(0.95, rate(chaincode_shim_request_duration_bucket[30m]))
```

**Chức năng:** Thời gian thực thi chaincode business logic

**Loại:** Timeseries graph

**Ý nghĩa:** 
- Đo hiệu suất business logic code
- Phát hiện functions chậm
- Chaincode optimization target

**Giá trị điển hình:**
- Simple reads: ~5-20ms
- Writes with validation: ~20-50ms
- Complex logic: ~50-200ms

---

## Phân loại Metrics

### **Availability Metrics**
- Peer Status
- Ledger Block Height

### **Performance Metrics**
- Transaction Latency (p50/p95/p99)
- End-to-End Transaction Latency
- Block Creation Time
- Block Commit Time
- Chaincode Execution Time

### **Throughput Metrics**
- Transaction Rate
- Business Transactions by Organization

### **Error Metrics**
- Endorsement Failures

### **Analysis Metrics**
- Transaction Flow Breakdown
- Average Latency by Chaincode

---

## Giải thích Percentiles

### **p50 (Median - Trung vị)**
- 50% requests có latency ≤ giá trị này
- Phản ánh trải nghiệm của người dùng điển hình
- Không bị outliers làm sai lệch

### **p95 (Percentile 95)**
- 95% requests có latency ≤ giá trị này
- Chỉ 5% requests chậm hơn
- **Best practice cho SLA monitoring**

### **p99 (Percentile 99)**
- 99% requests có latency ≤ giá trị này
- Chỉ 1% requests chậm hơn
- Phát hiện worst-case scenarios

**Tại sao không dùng Average?**
- Average bị outliers làm sai lệch
- Không phản ánh trải nghiệm thực tế
- Ví dụ: 99 requests @50ms + 1 request @5000ms
  - Average = 100ms (misleading)
  - p50 = 50ms (accurate typical experience)
  - p99 = 5000ms (reveals the outlier)

---

## Cấu hình Dashboard

**Refresh rate:** 10 giây

**Time window queries:** 30 phút (`[30m]`)

**Default time range:** Last 1 hour

**Datasource:** Prometheus (uid: PBFA97CFB590B2093)

**Dashboard UID:** fabric-overview

**Tags:** hyperledger, fabric, blockchain

---

## Optimization Tips

### Giảm End-to-End Latency:
1. **Giảm BatchTimeout** từ 2s → 0.5s trong `configtx.yaml`
2. **Tăng MaxMessageCount** để cắt block sớm hơn
3. **Optimize chaincode** để giảm endorsement time
4. **Tune CouchDB** để giảm commit time

### Cải thiện Throughput:
1. **Parallel endorsements** với nhiều peers
2. **Batch submissions** từ client
3. **Cache frequently read data** trong chaincode

### Giảm Errors:
1. **Review endorsement policy** nếu failures cao
2. **Add retry logic** trong client app
3. **Monitor peer logs** để debug validation errors

---

## Alert Rules Tích hợp

Dashboard này hoạt động với alert rules trong `alerts.yml`:

- **PeerDown**: Peer offline > 1 phút
- **OrdererDown**: Orderer offline > 1 phút
- **HighEndorsementFailureRate**: > 10% failures trong 5 phút
- **LedgerHeightStale**: Không có block mới trong 10 phút
- **HighCPU**: > 80% CPU usage trong 5 phút
- **HighMemory**: > 85% memory usage trong 5 phút

---

## Truy cập Dashboard

**URL:** http://localhost:3002

**Credentials:**
- Username: `admin`
- Password: `admin`

**Scripts:**
```bash
# Start monitoring stack
./network/monitoring-up.sh

# Stop monitoring stack
./network/monitoring-down.sh

# Check monitoring status
./network/monitoring-status.sh
```

---

## Troubleshooting

### Dashboard hiển thị "No data":
1. Kiểm tra Prometheus targets: http://localhost:9090/targets
2. Verify metrics endpoints: `curl http://localhost:9444/metrics`
3. Restart Fabric network để load metrics config

### Nhiều giá trị NaN:
1. Chưa đủ data points trong time window
2. Gửi thêm transactions để tạo data
3. Giảm time window từ `[30m]` → `[5m]`

### Query trả về 0:
1. Kiểm tra filter `chaincode="real-estate-cc"` đúng tên
2. Verify channel name `rentalchannel`
3. Check Prometheus scrape interval

---

**Generated:** December 3, 2025  
**Fabric Version:** 2.x  
**Monitoring Stack:** Prometheus v2.48.0 + Grafana v10.2.2
