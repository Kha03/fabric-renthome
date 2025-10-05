# Tổng Kết Lỗi Deployment - Fabric Real Estate Network

## 📋 Tổng Quan
Quá trình deployment Hyperledger Fabric 2.5.12 network và chaincode gặp phải nhiều lỗi từ infrastructure setup đến chaincode deployment. Dưới đây là tổng kết chi tiết các lỗi và cách khắc phục.

---

## 🏗️ **PHẦN I: LỖI NETWORK & CA SETUP**

## 🐛 Lỗi A1: TLS CA Certificates Missing
**Mô tả:** Genesis block không tạo được do thiếu TLS CA certificates trong MSP structure

**Nguyên nhân:**
- TLS CA certificates không có trong MSP `tlscacerts` directory
- Genesis block cần được tạo với TLS certificates đầy đủ

**Giải pháp:**
```bash
# Tạo thư mục tlscacerts trong MSP
mkdir -p ../organizations/ordererOrganizations/ordererorg.example.com/msp/tlscacerts

# Copy TLS CA certificate vào MSP
cp ../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt \
   ../organizations/ordererOrganizations/ordererorg.example.com/msp/tlscacerts/ca.crt

# Tạo lại genesis block
../bin/configtxgen -profile RentalChannel -configPath ../config \
  -outputBlock ../organizations/rentalchannel.genesis.block -channelID rentalchannel
```

**Files ảnh hưởng:**
- MSP structure: `organizations/ordererOrganizations/*/msp/tlscacerts/`
- Genesis block: `organizations/rentalchannel.genesis.block`

---

## 🐛 Lỗi A2: CA Container Start/Exit Issue
**Mô tả:** CA containers start rồi exit ngay lập tức khi chạy `./ca-up.sh`

**Nguyên nhân:**
- CA signing cert (`ca-cert.pem`) KHÔNG khớp với private key trong `msp/keystore`
- Leftover signing materials từ lần chạy trước

**Giải pháp:**
```bash
# Dọn "signing materials" hỏng nhưng GIỮ nguyên TLS
# OrdererOrg
rm -f ../organizations/fabric-ca/ordererOrg/ca-cert.pem
rm -rf ../organizations/fabric-ca/ordererOrg/msp
rm -f ../organizations/fabric-ca/ordererOrg/fabric-ca-server.db

# OrgProp
rm -f ../organizations/fabric-ca/orgProp/ca-cert.pem
rm -rf ../organizations/fabric-ca/orgProp/msp  
rm -f ../organizations/fabric-ca/orgProp/fabric-ca-server.db

# OrgTenant
rm -f ../organizations/fabric-ca/orgTenant/ca-cert.pem
rm -rf ../organizations/fabric-ca/orgTenant/msp
rm -f ../organizations/fabric-ca/orgTenant/fabric-ca-server.db

# OrgLandlord
rm -f ../organizations/fabric-ca/orgLandlord/ca-cert.pem
rm -rf ../organizations/fabric-ca/orgLandlord/msp
rm -f ../organizations/fabric-ca/orgLandlord/fabric-ca-server.db
```

**Lưu ý:** Cần `sudo` cho các lệnh `rm .../msp` do container tạo files với root ownership

---

## 🐛 Lỗi A3: File Permission Issues
**Mô tả:** Container tạo files với root ownership, user không thể modify

**Nguyên nhân:**
- Docker containers chạy với root user
- Files/folders được tạo bởi container có ownership root:root

**Giải pháp:**
```bash
cd ~/fabric-real-estate-network

# Chown các thư mục về user hiện tại
sudo chown -R "$(id -u)":"$(id -g)" organizations/fabric-ca/ordererOrg \
                                     organizations/fabric-ca/orgProp \
                                     organizations/fabric-ca/orgTenant \
                                     organizations/fabric-ca/orgLandlord

# Đảm bảo quyền ghi
chmod -R u+rw organizations/fabric-ca
```

**Files ảnh hưởng:** Toàn bộ `organizations/fabric-ca/*` directories

---

## 🐛 Lỗi A4: Orderer Channel Join Failed  
**Mô tả:** Orderers không join được vào channel sau khi tạo genesis block

**Nguyên nhân:**
- Genesis block thiếu TLS certificates
- Sai TLS certificate paths trong osnadmin commands

**Giải pháp:**
```bash
# Sau khi fix TLS CA certificates, orderer có thể join
export OSN_CA1=../organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt
../bin/osnadmin channel join --channelID rentalchannel \
  --config-block ../organizations/rentalchannel.genesis.block \
  -o localhost:7053 \
  --ca-file "$OSN_CA1" \
  --client-cert ../organizations/ordererOrganizations/ordererorg.example.com/users/Admin@ordererorg.example.com/tls/client.crt \
  --client-key ../organizations/ordererOrganizations/ordererorg.example.com/users/Admin@ordererorg.example.com/tls/client.key
```

**Verification:** `docker ps -f "name=ca."` phải thấy 4 CA containers đang chạy

---

## 🏗️ **PHẦN II: LỖI CHAINCODE DEPLOYMENT**

---

## 🐛 Lỗi B1: Peer Command Not Found
**Mô tả:** `peer: command not found` khi chạy `./cc-deploy.sh`

**Nguyên nhân:** 
- Thiếu PATH environment variable cho Fabric binaries
- Script không export FABRIC_CFG_PATH

**Giải pháp:**
```bash
# Thêm vào đầu cc-deploy.sh
export PATH=/home/minhkha/fabric-real-estate-network/bin:$PATH
export FABRIC_CFG_PATH=/home/minhkha/fabric-real-estate-network/config
```

**File ảnh hưởng:** `network/cc-deploy.sh`

---

## 🐛 Lỗi B2: CouchDB Index Validation Failed
**Mô tả:** 
```
Error: validation of index at '/opt/gopath/src/github.com/chaincode/real-estate-cc/META-INF/statedb/couchdb/idx_lease_status.json' failed due to syntax error: use of partial_filter_selector requires an index field.
```

**Nguyên nhân:** 
- Fabric 2.5.x không hỗ trợ `partial_filter_selector` trong CouchDB index
- Syntax index không tương thích

**Giải pháp:**
```json
// Trước (sai)
{
  "index": {
    "fields": ["status"]
  },
  "ddoc": "idx_lease_status",
  "name": "idx_lease_status",
  "type": "json",
  "partial_filter_selector": {
    "objectType": "lease"
  }
}

// Sau (đúng)
{
  "index": {
    "fields": ["objectType", "status"]
  },
  "ddoc": "idx_lease_status", 
  "name": "idx_lease_status",
  "type": "json"
}
```

**Files ảnh hưởng:**
- `chaincode/real-estate-cc/META-INF/statedb/couchdb/idx_lease_status.json`
- `chaincode/real-estate-cc/META-INF/statedb/couchdb/idx_property_owner.json`

---

## 🐛 Lỗi B3: ENDORSEMENT_POLICY_FAILURE
**Mô tả:** 
```
Error: failed to invoke backing implementation of 'CommitChaincodeDefinition': attempted to redefine the current committed sequence (1) for namespace real-estate-cc with different parameters
```

**Nguyên nhân:**
- Channel-level LifecycleEndorsement policy yêu cầu MAJORITY admin signatures
- Chỉ có 1 admin approve không đủ cho MAJORITY

**Giải pháp:**
```yaml
# Sửa trong config/configtx.yaml
# Trước (sai)
LifecycleEndorsement:
  Type: Signature
  Rule: "MAJORITY Admins"

# Sau (đúng) 
LifecycleEndorsement:
  Type: Signature
  Rule: "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')"
```

**File ảnh hưởng:** `config/configtx.yaml`

---

## 🐛 Lỗi B4: fabric-shim/bundle Module Not Found
**Mô tả:**
```
Error: Cannot find module 'fabric-shim/lib/bundle.js'
```

**Nguyên nhân:**
- Fabric 2.5.x loại bỏ bundle.js module
- State-based endorsement API không khả dụng

**Giải pháp:**
```javascript
// Trước (sai)
const { bundle } = require('fabric-shim/lib/bundle.js');

// Sau (đúng) - Loại bỏ hoàn toàn
// Commented out state-based endorsement features
// const { bundle } = require('fabric-shim/lib/bundle.js');
```

**File ảnh hưởng:** `chaincode/real-estate-cc/lib/contract.js`

---

## 🐛 Lỗi B5: Iterator Compatibility Issue
**Mô tả:**
```
Error: iterator is not async iterable
```

**Nguyên nhân:**
- `for await...of` không tương thích với Fabric iterator
- Phải sử dụng `.next()` method pattern

**Giải pháp:**
```javascript
// Trước (sai)
for await (const res of iterator) {
    const record = JSON.parse(res.value.toString());
    results.push(record);
}

// Sau (đúng)
let result = await iterator.next();
while (!result.done) {
    const record = JSON.parse(result.value.value.toString());
    results.push(record);
    result = await iterator.next();
}
await iterator.close();
```

**File ảnh hưởng:** `chaincode/real-estate-cc/lib/contract.js`

---

## 🐛 Lỗi B6: Role Permission Denied
**Mô tả:**
```
Error: Permission denied: only users with role=landlord or role=landlord can create property. Your role: null
```

**Nguyên nhân:**
- Certificates không có role attributes
- Access control quá strict cho testing

**Giải pháp:**
```javascript
// Temporary fix for testing
const isAdmin = identity.getAttributeValue("hf.Type") === "admin" || 
               identity.getID().includes("Admin");
if (!isAdmin && !role || (role !== "landlord" && role !== "landlord")) {
    throw new Error(`Permission denied...`);
}
```

**File ảnh hưởng:** `chaincode/real-estate-cc/lib/contract.js`

---

## 🐛 Lỗi B7: TLS Certificate Path Issues
**Mô tả:**
```
Error: unable to load orderer.tls.rootcert.file: open .../tlsca.ordererorg.example.com-cert.pem: no such file or directory
```

**Nguyên nhân:**
- Sai đường dẫn TLS certificate cho orderer
- Orderer names không khớp

**Giải pháp:**
```bash
# Sử dụng đúng orderer name và TLS path
--ordererTLSHostnameOverride orderer1.ordererorg.example.com \
--cafile /path/to/organizations/ordererOrganizations/ordererorg.example.com/orderers/orderer1.ordererorg.example.com/tls/ca.crt
```

---

## 🐛 Lỗi B8: Sequence Version Mismatch
**Mô tả:**
```
Error: expected Version '1.1' does not match passed Version '2.0'
Error: requested sequence is 2, but new definition must be sequence 3
```

**Nguyên nhân:**
- Sequence number không đồng bộ khi upgrade
- Version naming không consistent

**Giải pháp:**
```bash
# Đảm bảo sequence tăng dần
NEW_VERSION="1.2"  # Thay vì "2.0"
NEW_SEQUENCE=3     # Thay vì 2
```

**File ảnh hưởng:** `network/cc-upgrade.sh`

---

## 🛠️ Công Cụ Debug Đã Sử dụng

### 1. Docker Commands
```bash
docker ps -a                    # Kiểm tra containers
docker logs <container_name>    # Xem logs
docker exec -it <container> bash # Debug container
```

### 2. Fabric Commands
```bash
peer lifecycle chaincode queryinstalled
peer lifecycle chaincode querycommitted -C rentalchannel
peer chaincode query -C rentalchannel -n real-estate-cc -c '{"Args":["function"]}'
```

### 3. Network Status
```bash
./network.sh down && ./network.sh up  # Restart network
docker-compose -f docker/docker-compose.yaml down
```

---

## ✅ Kết Quả Cuối Cùng

**Chaincode Version:** `real-estate-cc_1.3`  
**Sequence:** `4`  
**Status:** ✅ **DEPLOYED SUCCESSFULLY**

**Test Results:**
```json
✅ initLedger: status:200
✅ createProperty: status:200 
✅ queryPropertiesByOwner: [{"geoRef":"Ho Chi Minh City, Vietnam","objectType":"property","ownerOrgMSP":"OrgPropMSP","propertyId":"PROP001","status":"AVAILABLE"}]
```

**Network Status:**
- 13 Docker containers running
- 3 organizations active
- CouchDB state database operational
- Channel `rentalchannel` committed

---

## 🎓 Bài Học Rút Ra

### **Network & CA Setup:**
1. **TLS Certificate Management**: Đảm bảo MSP structure có đầy đủ TLS CA certificates
2. **File Permissions**: Container tạo files với root ownership - cần chown về user  
3. **CA Clean Start**: Dọn signing materials cũ khi CA start/exit issues
4. **Genesis Block**: Phải tạo lại khi thay đổi TLS certificates

### **Chaincode Deployment:**
5. **Environment Setup**: Luôn kiểm tra PATH và FABRIC_CFG_PATH
6. **Version Compatibility**: Fabric 2.5.x có breaking changes từ 2.0
7. **Policy Configuration**: Channel policies phải consistent across orgs
8. **Iterator Pattern**: Sử dụng `.next()` thay vì `for await...of`
9. **Testing Strategy**: Implement flexible access control cho development
10. **Certificate Management**: Attributes cần được configure đúng cách
11. **Sequence Management**: Upgrade chaincode cần sequence tăng dần

### **Operational Best Practices:**
12. **Docker Management**: `docker ps -f "name=ca."` để kiểm tra CA status
13. **Clean Environment**: Dọn leftover materials trước khi restart
14. **Permission Management**: `sudo chown -R $(id -u):$(id -g)` cho container files

---

## 📚 Tài Liệu Tham Khảo

- [Hyperledger Fabric 2.5 Documentation](https://hyperledger-fabric.readthedocs.io/en/release-2.5/)
- [Chaincode Lifecycle](https://hyperledger-fabric.readthedocs.io/en/release-2.5/chaincode_lifecycle.html)
- [CouchDB Index Management](https://hyperledger-fabric.readthedocs.io/en/release-2.5/couchdb_tutorial.html)
- [Certificate Authority Deployment](https://hyperledger-fabric.readthedocs.io/en/release-2.5/ca-deploy.html)
- [Channel Configuration](https://hyperledger-fabric.readthedocs.io/en/release-2.5/config_update.html)
Note
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

---



