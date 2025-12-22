# Kiến Trúc và Hoạt Động của CA (Certificate Authority) trong Hệ Thống

## 1. Tổng Quan Kiến Trúc CA

Hệ thống sử dụng **4 CA servers độc lập**, mỗi tổ chức có một CA riêng để quản lý certificates và identities:

```
┌─────────────────────────────────────────────────────────────┐
│                    CA Infrastructure                         │
├─────────────────────────────────────────────────────────────┤
│ • ca.ordererorg.example.com    → Port 10054 (Orderer Org)  │
│ • ca.orgprop.example.com       → Port 7054  (OrgProp)       │
│ • ca.orgtenant.example.com     → Port 8054  (OrgTenant)     │
│ • ca.orglandlord.example.com   → Port 9054  (OrgLandlord)   │
└─────────────────────────────────────────────────────────────┘
```

## 2. Thiết Lập CA

### 2.1. Cấu Hình CA (compose/ca.yml)

Mỗi CA được triển khai dưới dạng Docker container với các đặc điểm:

```yaml
services:
  ca.orgprop.example.com:
    image: hyperledger/fabric-ca:latest
    environment:
      - FABRIC_CA_SERVER_CA_NAME=ca-orgprop
      - FABRIC_CA_SERVER_TLS_ENABLED=true
      - FABRIC_CA_SERVER_PORT=7054
    ports:
      - "7054:7054"
    command: sh -c 'fabric-ca-server start -d -b admin:adminpw --port 7054'
    volumes:
      - /opt/fabric/.../organizations/fabric-ca/orgProp:/etc/hyperledger/fabric-ca-server
```

**Các thành phần quan trọng:**
- **Bootstrap Identity**: `admin:adminpw` - Tài khoản admin mặc định được tạo khi CA khởi động
- **TLS Enabled**: Tất cả CA đều bật TLS để mã hóa kết nối
- **Persistent Storage**: Data được lưu tại `organizations/fabric-ca/<orgName>/`
- **Database**: SQLite database (`fabric-ca-server.db`) lưu trữ registered identities

### 2.2. Khởi Động CA (network/ca-up.sh)

Quy trình khởi động:

```bash
#!/bin/bash
# 1. Generate TLS certificates cho mỗi CA
./ca-tls-gen.sh

# 2. Start tất cả CA containers
docker compose -f docker-compose.yaml up -d \
  ca.ordererorg.example.com \
  ca.orgprop.example.com \
  ca.orgtenant.example.com \
  ca.orglandlord.example.com
```

### 2.3. Tạo TLS Certificates (network/ca-tls-gen.sh)

Script tự động tạo TLS certificates cho mỗi CA server sử dụng OpenSSL:

```bash
# Tạo self-signed certificate với SAN (Subject Alternative Name)
openssl req -x509 -nodes -newkey rsa:4096 \
  -keyout tls-key.pem \
  -out tls-cert.pem \
  -days 365 \
  -config openssl.cnf
```

**Output:**
- `tls-key.pem` - Private key của CA server
- `tls-cert.pem` - Public certificate của CA server

## 3. Quy Trình Enrollment Chi Tiết

File `network/register-enroll.sh` thực hiện toàn bộ quá trình, chia làm 3 giai đoạn chính:

### GIAI ĐOẠN 1: Enroll CA Admin

```bash
enroll_ca_admin "ordererOrg" 10054 "ca-orderer-org"
```

**Điều gì xảy ra:**

1. **fabric-ca-client** kết nối đến CA server qua HTTPS:
```bash
fabric-ca-client enroll \
  -u "https://admin:adminpw@localhost:10054" \
  --caname "ca-orderer-org" \
  --tls.certfiles "/path/to/tls-cert.pem"
```

2. **CA Server xác thực:**
   - Verify username/password với bootstrap identity
   - Generate certificate signing request (CSR)
   - Sign certificate với CA's private key

3. **Kết quả được lưu tại:** `organizations/fabric-ca/ordererOrg/msp/`
   ```
   msp/
   ├── signcerts/
   │   └── cert.pem              # CA admin's certificate
   ├── keystore/
   │   └── <hash>_sk             # CA admin's private key
   ├── cacerts/
   │   └── localhost-10054-ca-orderer-org.pem  # CA root certificate
   └── IssuerPublicKey           # CA's public key
   ```

4. **CA admin certificate** này được dùng cho tất cả operations tiếp theo (register identities)

### GIAI ĐOẠN 2: Register Identities

```bash
register_identity "ca-orderer-org" "orderer1" "orderer1pw" "orderer" "ordererOrg.department1" "" "ordererOrg"
```

**Điều gì xảy ra:**

1. **CA Admin gọi register API:**
```bash
fabric-ca-client register \
  --caname "ca-orderer-org" \
  --id.name "orderer1" \
  --id.secret "orderer1pw" \
  --id.type "orderer" \
  --id.affiliation "ordererOrg.department1" \
  --tls.certfiles "/path/to/tls-cert.pem"
```

2. **CA Server xử lý:**
   - Verify rằng caller có quyền register (dựa vào CA admin cert)
   - Validate affiliation exists
   - Lưu identity vào database (`fabric-ca-server.db`)
   - Return success

3. **Không có certificate được tạo ở bước này** - chỉ register thông tin

**Các loại identities được register:**

| Organization | Identity Type | Examples | Attributes |
|--------------|---------------|----------|------------|
| OrdererOrg | orderer | orderer1 | - |
| OrdererOrg | admin | ordererAdmin | Registrar, Revoker, AffiliationMgr |
| OrgProp | peer | peer0 | - |
| OrgProp | client | user1 | role=landlord |
| OrgProp | admin | orgPropAdmin | - |
| OrgTenant | peer | peer0 | - |
| OrgTenant | client | user1 | role=tenant |
| OrgTenant | admin | orgTenantAdmin | - |
| OrgLandlord | peer | peer0 | - |
| OrgLandlord | client | user1 | role=landlord |
| OrgLandlord | admin | orgLandlordAdmin | - |

### GIAI ĐOẠN 3: Enroll Registered Identities

#### 3.1. Enroll MSP Certificates

**Ví dụ: Enroll Peer0 của OrgProp:**

```bash
fabric-ca-client enroll \
  -u "https://peer0:peer0pw@localhost:7054" \
  --caname "ca-orgprop" \
  -M "/organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/msp" \
  --csr.hosts "peer0.orgprop.example.com" \
  --tls.certfiles "/path/to/tls-cert.pem"
```

**Điều gì xảy ra:**

1. **Client-side:**
   - Generate keypair (private/public key) locally
   - Create Certificate Signing Request (CSR) với public key
   - Gửi CSR + credentials đến CA server

2. **CA Server:**
   - Verify `peer0:peer0pw` trong database
   - Extract public key từ CSR
   - Sign certificate với CA's private key
   - Embed attributes và OU (Organizational Unit) vào certificate
   - Return signed certificate

3. **Output MSP structure:**
   ```
   peer0.orgprop.example.com/msp/
   ├── signcerts/
   │   └── cert.pem              # Peer's identity certificate (public)
   ├── keystore/
   │   └── <hash>_sk             # Peer's private key
   ├── cacerts/
   │   └── localhost-7054-ca-orgprop.pem  # CA root certificate
   └── config.yaml               # NodeOU configuration
   ```

#### 3.2. Enroll TLS Certificates (riêng biệt)

```bash
fabric-ca-client enroll \
  -u "https://peer0:peer0pw@localhost:7054" \
  --caname "ca-orgprop" \
  -M "/organizations/.../peer0.orgprop.example.com/tls" \
  --enrollment.profile tls \
  --csr.hosts "peer0.orgprop.example.com,localhost" \
  --tls.certfiles "/path/to/tls-cert.pem"
```

**Mục đích:** Tạo certificates riêng cho TLS communication (gRPC)

**Output TLS structure:**
```
peer0.orgprop.example.com/tls/
├── server.crt    # TLS certificate
├── server.key    # TLS private key
└── ca.crt        # CA TLS root certificate
```

**Lưu ý:** TLS certificates khác với MSP certificates:
- **MSP certs**: Dùng để xác thực identity và sign transactions
- **TLS certs**: Dùng để mã hóa network communication

#### 3.3. NodeOU Configuration

File `config.yaml` trong MSP folder định nghĩa role-based access:

```yaml
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-orgprop.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-orgprop.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-orgprop.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-orgprop.pem
    OrganizationalUnitIdentifier: orderer
```

**Chức năng:**
- Hyperledger Fabric sử dụng OU field trong certificate để xác định role
- Không cần explicit admin certificates trong channel config
- Tự động authorize dựa trên OU value

## 4. Cấu Trúc MSP (Membership Service Provider)

### 4.1. Organization-level MSP

Được tạo bởi function `prepare_org_msp()`:

```
organizations/peerOrganizations/orgprop.example.com/msp/
├── cacerts/
│   └── localhost-7054-ca-orgprop.pem  # Root CA certificate
└── config.yaml                         # NodeOU config
```

**Mục đích:** Define organization-wide trust anchor và role mappings

### 4.2. Node-level MSP

Mỗi peer/orderer có MSP riêng:

```
organizations/peerOrganizations/orgprop.example.com/peers/peer0.orgprop.example.com/
├── msp/
│   ├── signcerts/cert.pem      # Node identity
│   ├── keystore/<hash>_sk      # Node private key
│   ├── cacerts/...             # CA root cert
│   └── config.yaml             # NodeOU config
└── tls/
    ├── server.crt              # TLS certificate
    ├── server.key              # TLS private key
    └── ca.crt                  # TLS CA root cert
```

### 4.3. User-level MSP

Mỗi user/admin có MSP riêng:

```
organizations/peerOrganizations/orgprop.example.com/users/Admin@orgprop.example.com/msp/
├── signcerts/cert.pem          # Admin identity
├── keystore/<hash>_sk          # Admin private key
├── cacerts/...                 # CA root cert
└── config.yaml                 # NodeOU config
```

## 5. Luồng Hoạt Động Tổng Thể

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. START CA SERVERS                                             │
│    • ca-tls-gen.sh: Generate TLS certs for CA servers          │
│    • docker compose up: Start all 4 CA containers              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. ENROLL CA ADMIN (Bootstrap)                                  │
│    • Use bootstrap identity: admin/adminpw                      │
│    • Receive CA admin certificate                               │
│    • Save to: organizations/fabric-ca/<org>/msp/                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. ENSURE AFFILIATIONS                                          │
│    • Create org hierarchy: orgProp, orgProp.department1         │
│    • Store in CA database                                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. PREPARE ORGANIZATION MSP                                     │
│    • Copy CA root cert to org MSP folder                        │
│    • Generate config.yaml with NodeOU settings                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. REGISTER IDENTITIES                                          │
│    • CA admin registers: orderers, peers, users, org admins     │
│    • Identities stored in CA database (fabric-ca-server.db)     │
│    • No certificates generated yet                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. ENROLL IDENTITIES                                            │
│    • Each identity enrolls with username/password               │
│    • Generate keypair locally                                   │
│    • Receive signed certificate from CA                         │
│    • Save MSP to appropriate location                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. ENROLL TLS CERTIFICATES (separate enrollment)                │
│    • Use same username/password                                 │
│    • Request with --enrollment.profile tls                      │
│    • Receive TLS certificates                                   │
│    • Save to tls/ folder                                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. NODES USE CERTIFICATES                                       │
│    • Peers/Orderers load MSP when starting                      │
│    • Use identity cert to sign endorsements/blocks              │
│    • Use TLS cert to encrypt gRPC communication                 │
│    • Users use certificates to sign transactions                │
└─────────────────────────────────────────────────────────────────┘
```

## 6. Vai Trò của CA trong Runtime

### 6.1. Sau Khi Enrollment Hoàn Tất

**CA không cần thiết cho hoạt động bình thường:**
- Nodes sử dụng certificates đã được cấp
- Không cần query CA trong mỗi transaction
- Certificates tự xác thực (signed by trusted CA)

### 6.2. Khi Cần CA

CA được sử dụng cho:

1. **Re-enrollment:** Khi certificates gần hết hạn
   ```bash
   fabric-ca-client reenroll -u https://peer0:peer0pw@localhost:7054
   ```

2. **Revocation:** Thu hồi certificates bị compromise
   ```bash
   fabric-ca-client revoke --revoke.name peer0 --gencrl
   ```

3. **Register New Identities:** Thêm users/nodes mới
   ```bash
   fabric-ca-client register --id.name newuser --id.secret newpw
   ```

4. **Certificate Lifecycle Management:**
   - Check expiration dates
   - Generate CRL (Certificate Revocation List)
   - Rotate CA root certificates (advanced)

### 6.3. High Availability

Trong production:
- Deploy multiple CA replicas với shared database
- Use PostgreSQL thay vì SQLite
- Enable HA proxy cho load balancing

## 7. Security Features

### 7.1. TLS Mutual Authentication

```
Client ←---TLS Handshake---→ CA Server
   ↓                              ↓
Verify CA's cert           Verify client's cert
```

**Cả hai bên phải verify certificates của nhau:**
- Client verify CA's TLS cert (tls-cert.pem)
- CA verify client's enrollment cert (nếu required)

### 7.2. Attribute-Based Access Control (ABAC)

Attributes trong certificates dùng cho authorization:

```bash
register_identity "ca-orgprop" "user1" "user1pw" "client" \
  "orgProp.department1" "role=landlord" "orgProp"
```

**Trong chaincode:**
```javascript
// Check if user has landlord role
const role = ctx.clientIdentity.getAttributeValue('role');
if (role !== 'landlord') {
    throw new Error('Only landlords can create properties');
}
```

### 7.3. Affiliation Management

Phân cấp tổ chức:
```
orgProp
└── orgProp.department1
    └── orgProp.department1.team1
```

**Sử dụng:**
- CA admin chỉ có thể register users trong affiliations được phép
- Limit scope of authority
- Organizational hierarchy

### 7.4. Certificate Revocation

**CRL (Certificate Revocation List):**
```bash
# Revoke a certificate
fabric-ca-client revoke --revoke.name user1

# Generate CRL
fabric-ca-client gencrl -M /path/to/msp

# Distribute CRL to all nodes
cp crl.pem /path/to/msp/crls/
```

**Nodes periodically check CRL để reject revoked certificates**

## 8. Troubleshooting

### 8.1. Common Issues

**Issue 1: "TLS handshake failed"**
```bash
# Check TLS certificate
openssl x509 -in tls-cert.pem -text -noout

# Verify SAN includes hostname
# Re-generate with ca-tls-gen.sh if needed
```

**Issue 2: "Identity already registered"**
```bash
# Check if identity exists
fabric-ca-client identity list --caname ca-orgprop

# Use --force to update (if supported)
# Or skip registration in script (handled automatically)
```

**Issue 3: "Certificate expired"**
```bash
# Check expiration
openssl x509 -in signcerts/cert.pem -noout -dates

# Re-enroll
fabric-ca-client reenroll -u https://user:pw@localhost:7054
```

### 8.2. Verification Commands

```bash
# Check CA is running
docker ps -f "name=ca."

# Check CA logs
docker logs ca.orgprop.example.com

# Test CA connectivity
curl -k https://localhost:7054/cainfo

# List registered identities
fabric-ca-client identity list --caname ca-orgprop \
  --tls.certfiles tls-cert.pem

# View certificate details
openssl x509 -in msp/signcerts/cert.pem -text -noout
```

## 9. Best Practices

### 9.1. Security

1. **Never commit private keys** to version control
2. **Rotate credentials regularly**
3. **Use strong passwords** cho registered identities
4. **Enable TLS** cho all CA communications
5. **Restrict CA admin access** - only trusted operators

### 9.2. Operations

1. **Backup CA database** regularly (`fabric-ca-server.db`)
2. **Monitor certificate expiration** dates
3. **Test re-enrollment** procedures
4. **Document affiliation structure**
5. **Use PostgreSQL** in production (not SQLite)

### 9.3. Development

1. **Automate enrollment** với scripts (như register-enroll.sh)
2. **Check if certificates exist** before re-enrolling
3. **Handle registration errors** gracefully (identity already exists)
4. **Use consistent naming** conventions
5. **Generate NodeOU config** automatically

## 10. Tóm Tắt

**CA trong Hyperledger Fabric là PKI (Public Key Infrastructure) provider:**

✅ **Chức năng chính:**
- Issue và manage X.509 certificates
- Register identities với attributes
- Support revocation và re-enrollment
- Provide root of trust cho organization

✅ **Quy trình:**
1. Start CA servers
2. Enroll CA admin (bootstrap)
3. Register identities
4. Enroll identities → receive certificates
5. Nodes/users sử dụng certificates để authenticate và sign

✅ **Không cần CA trong runtime bình thường** - certificates tự xác thực

✅ **Security features:**
- TLS mutual authentication
- Attribute-based access control
- Affiliation management
- Certificate revocation

Hệ thống của bạn thiết lập CA rất chuẩn chỉnh với separation of concerns (mỗi org có CA riêng), TLS enabled, và automation scripts đầy đủ!
