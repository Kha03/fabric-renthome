# Hyperledger Explorer - Hướng Dẫn Cài Đặt và Sử Dụng

## Tổng Quan

Hyperledger Explorer đã được cấu hình để kết nối với mạng Fabric Real Estate Network của bạn. Explorer cung cấp giao diện web để:
- Xem thông tin blockchain (blocks, transactions, chaincodes)
- Giám sát các peer và orderer nodes
- Xem chi tiết các tổ chức và channels
- Theo dõi hoạt động mạng real-time

## Cấu Trúc Thư Mục

```
explorer/
├── config.json                          # Cấu hình chính của Explorer
├── docker-compose-explorer.yaml         # Docker compose cho Explorer
└── connection-profile/
    └── real-estate-network.json        # Connection profile cho network
```

## Các File Đã Tạo

### 1. `explorer/config.json`
Cấu hình Explorer để kết nối với network của bạn.

### 2. `explorer/connection-profile/real-estate-network.json`
Connection profile chứa thông tin:
- 3 Peer organizations (OrgProp, OrgTenant, OrgLandlord)
- 3 Peers (peer0 của mỗi org)
- Channel: rentalchannel
- TLS certificates và admin credentials

### 3. `explorer/docker-compose-explorer.yaml`
Docker compose định nghĩa 2 services:
- **explorerdb.mynetwork.com**: PostgreSQL database cho Explorer
- **explorer.mynetwork.com**: Hyperledger Explorer web application

### 4. Scripts Quản Lý
- `network/explorer-up.sh`: Khởi động Explorer
- `network/explorer-down.sh`: Dừng Explorer

## Cài Đặt và Khởi Động

### Bước 1: Đảm Bảo Network Đang Chạy

Trước tiên, đảm bảo mạng Fabric của bạn đang chạy:

```bash
cd /opt/fabric/fabric-real-estate-network
docker ps
```

Bạn cần thấy các containers sau đang chạy:
- peer0.orgprop.example.com
- peer0.orgtenant.example.com
- peer0.orglandlord.example.com
- orderer1.ordererorg.example.com
- CouchDB instances

### Bước 2: Khởi Động Explorer

```bash
cd /opt/fabric/fabric-real-estate-network/network
./explorer-up.sh
```

Script này sẽ:
1. Kiểm tra network có đang chạy
2. Kiểm tra crypto materials
3. Khởi động Explorer database
4. Khởi động Explorer web application

### Bước 3: Kiểm Tra Trạng Thái

Chờ khoảng 30-60 giây để Explorer khởi động hoàn toàn, sau đó kiểm tra:

```bash
# Xem logs của Explorer
docker logs -f explorer.mynetwork.com

# Kiểm tra containers đang chạy
docker ps | grep explorer
```

Bạn nên thấy:
```
explorerdb.mynetwork.com
explorer.mynetwork.com
```

## Truy Cập Explorer

### URL và Thông Tin Đăng Nhập

- **URL**: http://localhost:8080
- **Username**: exploreradmin
- **Password**: exploreradminpw

### Trên Server (AWS/Cloud)

Nếu bạn đang chạy trên server từ xa:
1. Đảm bảo port 8080 được mở trong Security Group/Firewall
2. Truy cập: http://<SERVER_PUBLIC_IP>:8080

## Các Tính Năng Explorer

### 1. Dashboard
- Tổng quan về network
- Số lượng blocks, transactions
- Thông tin về các peers và channels

### 2. Network
- Xem topology của network
- Thông tin về các organizations
- Trạng thái của peers và orderers

### 3. Blocks
- Danh sách tất cả blocks
- Chi tiết từng block
- Transactions trong mỗi block

### 4. Transactions
- Lịch sử tất cả transactions
- Chi tiết transaction (reads/writes)
- Transaction validation status

### 5. Chaincodes
- Danh sách installed chaincodes
- Chaincode definitions
- Endorsement policies

## Quản Lý Explorer

### Xem Logs

```bash
# Explorer logs
docker logs -f explorer.mynetwork.com

# Database logs
docker logs -f explorerdb.mynetwork.com
```

### Dừng Explorer

```bash
cd /opt/fabric/fabric-real-estate-network/network
./explorer-down.sh
```

### Khởi Động Lại

```bash
# Dừng
./explorer-down.sh

# Khởi động lại
./explorer-up.sh
```

### Xóa Dữ Liệu Explorer (Reset)

Nếu muốn xóa toàn bộ dữ liệu Explorer và bắt đầu lại:

```bash
# Dừng Explorer
./explorer-down.sh

# Xóa database volume
docker volume rm explorer_explorerdb

# Khởi động lại
./explorer-up.sh
```

## Troubleshooting

### Lỗi: Cannot connect to database

**Giải pháp**: Đợi database khởi động hoàn toàn (30-60 giây), sau đó restart Explorer:
```bash
docker restart explorer.mynetwork.com
```

### Lỗi: No network found hoặc không thấy blocks

**Nguyên nhân**: Connection profile không đúng hoặc crypto materials không khớp

**Kiểm tra**:
```bash
# Kiểm tra admin cert tồn tại
ls -la /opt/fabric/fabric-real-estate-network/organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp/

# Xem Explorer logs để debug
docker logs explorer.mynetwork.com
```

### Lỗi: Permission denied

**Giải pháp**: Đảm bảo Docker có quyền đọc crypto materials:
```bash
sudo chmod -R 755 /opt/fabric/fabric-real-estate-network/organizations
```

### Port 8080 đã được sử dụng

**Giải pháp**: Thay đổi port trong `explorer/docker-compose-explorer.yaml`:
```yaml
ports:
  - 8090:8080  # Thay vì 8080:8080
```

## Cấu Hình Nâng Cao

### Thay Đổi Log Level

Chỉnh sửa `explorer/docker-compose-explorer.yaml`:
```yaml
environment:
  - LOG_LEVEL_APP=debug    # info, debug, trace
  - LOG_LEVEL_DB=debug
  - LOG_LEVEL_CONSOLE=debug
```

### Thêm Organizations Khác

Nếu muốn Explorer query từ org khác, cập nhật `explorer/connection-profile/real-estate-network.json`:
```json
"client": {
  "organization": "OrgTenantMSP"  // Thay đổi org
}
```

### Kết Nối Nhiều Networks

Thêm network mới vào `explorer/config.json`:
```json
"network-configs": {
  "real-estate-network": {
    "name": "Real Estate Network",
    "profile": "./connection-profile/real-estate-network.json"
  },
  "another-network": {
    "name": "Another Network",
    "profile": "./connection-profile/another-network.json"
  }
}
```

## Kiến Trúc Explorer

```
┌─────────────────┐
│   Web Browser   │
│  (Port 8080)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Explorer Container            │
│   (explorer.mynetwork.com)      │
│   - Web UI                      │
│   - Fabric SDK                  │
│   - Blockchain query service    │
└────────┬──────────────┬─────────┘
         │              │
         ▼              ▼
┌─────────────┐  ┌──────────────┐
│ PostgreSQL  │  │ Fabric Network│
│   Database  │  │   - Peers     │
│             │  │   - Orderers  │
└─────────────┘  └──────────────┘
```

## Bảo Mật

### Trong Production

1. **Thay đổi default credentials**:
   - Database: username/password trong docker-compose
   - Explorer: username/password trong connection profile

2. **Sử dụng HTTPS**: 
   - Setup nginx reverse proxy với SSL
   - Redirect port 80 → 443

3. **Firewall Rules**:
   - Chỉ mở port 8080 cho IP cần thiết
   - Không expose port 5432 (PostgreSQL)

4. **Authentication**:
   - Enable `enableAuthentication: true` trong connection profile
   - Quản lý user credentials cẩn thận

## Kiểm Tra Hoạt Động

### Test 1: Xem Dashboard
1. Mở http://localhost:8080
2. Đăng nhập
3. Kiểm tra số blocks > 0

### Test 2: Xem Transactions
1. Click vào "Blocks" tab
2. Click vào bất kỳ block nào
3. Xem chi tiết transactions

### Test 3: Xem Chaincode
1. Click vào "Chaincodes" tab
2. Kiểm tra chaincode "real-estate-cc" xuất hiện
3. Xem endorsement policy

## Tài Nguyên Bổ Sung

- **Official Docs**: https://github.com/hyperledger/blockchain-explorer
- **Explorer Release**: https://hub.docker.com/r/hyperledger/explorer
- **Fabric Docs**: https://hyperledger-fabric.readthedocs.io/

## Tóm Tắt Lệnh

```bash
# Khởi động Explorer
cd /opt/fabric/fabric-real-estate-network/network
./explorer-up.sh

# Xem logs
docker logs -f explorer.mynetwork.com

# Dừng Explorer
./explorer-down.sh

# Xóa database và reset
docker volume rm explorer_explorerdb

# Kiểm tra containers
docker ps | grep explorer
```

---

**Lưu ý**: Explorer chỉ có thể xem dữ liệu từ blockchain, không thể tạo transactions mới. Để tạo transactions, sử dụng chaincode invoke scripts trong thư mục `network/`.
