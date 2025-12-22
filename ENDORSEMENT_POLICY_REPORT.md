# 🔐 Endorsement Policy Report - Real Estate Network

## ✅ TÓM TẮT: CÓ ENDORSEMENT POLICY TRONG HỆ THỐNG

Hệ thống của bạn **ĐÃ CẤU HÌNH** Endorsement Policy ở nhiều cấp độ khác nhau.

---

## 📋 CÁC CẤP ĐỘ ENDORSEMENT POLICY

### 1. **Channel-Level Endorsement Policy**

**Vị trí:** `config/configtx.yaml`

```yaml
Application:
    Policies:
        # Default Endorsement Policy cho channel
        Endorsement:
            Type: Signature
            Rule: "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')"
```

**Ý nghĩa:**
- Policy mặc định cho TẤT CẢ chaincode trên channel
- Yêu cầu: **Ít nhất 1 peer** từ **bất kỳ org nào** trong 3 orgs phải endorse
- Rule: **OR** logic (1/3 orgs)

---

### 2. **Chaincode-Level Endorsement Policy**

**Vị trí:** `network/cc-deploy.sh`

```bash
--signature-policy "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')"
```

**Chi tiết:**
- **Chaincode:** `real-estate-cc`
- **Version:** 2.3.0
- **Sequence:** 1
- **Policy:** OR của 3 MSPs

**Áp dụng khi:**
```bash
peer lifecycle chaincode approveformyorg ... --signature-policy "..."
peer lifecycle chaincode commit ... --signature-policy "..."
```

---

### 3. **LifecycleEndorsement Policy**

**Vị trí:** `config/configtx.yaml`

```yaml
Application:
    Policies:
        # Policy cho chaincode lifecycle operations (install, approve, commit)
        LifecycleEndorsement:
            Type: Signature
            Rule: "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')"
```

**Áp dụng cho:**
- Chaincode approval
- Chaincode commit
- Chaincode upgrade

---

## 📊 CHI TIẾT ENDORSEMENT POLICY HIỆN TẠI

### **Policy Type: Signature-Based**

```
Rule: OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')
```

### **Dịch nghĩa:**

```
ANY ONE of:
├─ OrgPropMSP.peer     (Peer from Property Management Org)
├─ OrgTenantMSP.peer   (Peer from Tenant Org)
└─ OrgLandlordMSP.peer (Peer from Landlord Org)
```

### **Điều kiện để Transaction được VALID:**

```
✅ Transaction phải được endorse bởi:
   - Ít nhất 1 peer từ OrgPropMSP
      HOẶC
   - Ít nhất 1 peer từ OrgTenantMSP
      HOẶC
   - Ít nhất 1 peer từ OrgLandlordMSP
```

---

## 🔍 PHÂN TÍCH POLICY HIỆN TẠI

### **Loại Policy: OR (Permissive)**

| Khía Cạnh | Giá Trị |
|-----------|---------|
| **Type** | OR (Disjunction) |
| **Minimum Endorsers** | 1 peer |
| **From Organizations** | Any 1 of 3 orgs |
| **Security Level** | Medium (permissive) |
| **Performance** | High (chỉ cần 1 endorsement) |

### **Ưu điểm:**
- ✅ Throughput cao (chỉ cần 1 endorsement)
- ✅ Availability tốt (1 org down, hệ thống vẫn hoạt động)
- ✅ Latency thấp (không cần đợi nhiều peers)

### **Nhược điểm:**
- ⚠️ Security thấp hơn (1 org có thể approve transaction)
- ⚠️ Không có consensus giữa các orgs
- ⚠️ Trust model: Tin tưởng hoàn toàn vào mỗi org

---

## 🎯 CÁC LOẠI ENDORSEMENT POLICY KHÁC

### **1. AND Policy (Restrictive)**

```yaml
# YÊU CẦU TẤT CẢ orgs phải endorse
Rule: "AND('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')"
```

**Ý nghĩa:**
- Cần 3/3 orgs endorse
- Security cao nhất
- Throughput thấp nhất
- 1 org down = toàn bộ network không hoạt động

**Use case:**
- High-value transactions
- Critical updates
- Consensus-based decisions

---

### **2. MAJORITY Policy**

```yaml
# YÊU CẦU ĐA SỐ orgs phải endorse
Rule: "OutOf(2, 'OrgPropMSP.peer', 'OrgTenantMSP.peer', 'OrgLandlordMSP.peer')"
```

**Ý nghĩa:**
- Cần 2/3 orgs endorse
- Balance giữa security và availability
- 1 org down, vẫn hoạt động

**Use case:**
- Standard business transactions
- Balanced security requirements
- Real estate contracts (recommended!)

---

### **3. Complex Policy (Mixed)**

```yaml
# YÊU CẦU: (OrgProp AND OrgTenant) HOẶC (OrgProp AND OrgLandlord)
Rule: "OR(AND('OrgPropMSP.peer','OrgTenantMSP.peer'), AND('OrgPropMSP.peer','OrgLandlordMSP.peer'))"
```

**Ý nghĩa:**
- Property manager PHẢI tham gia
- Cộng với tenant HOẶC landlord
- Role-based endorsement

**Use case:**
- Specific business logic
- Role-based workflows
- Multi-party agreements

---

## 💡 ĐỀ XUẤT CHO REAL ESTATE NETWORK

### **Đề xuất 1: MAJORITY Policy (Recommended)**

```bash
# Trong cc-deploy.sh
--signature-policy "OutOf(2, 'OrgPropMSP.peer', 'OrgTenantMSP.peer', 'OrgLandlordMSP.peer')"
```

**Lý do:**
- ✅ Security tốt hơn OR policy
- ✅ Availability tốt (1 org down vẫn OK)
- ✅ Consensus giữa majority orgs
- ✅ Phù hợp với real estate contracts

---

### **Đề xuất 2: Role-Based Policy**

**Cho CreateContract:**
```bash
# Cần landlord + property manager
"AND('OrgLandlordMSP.peer','OrgPropMSP.peer')"
```

**Cho RecordPayment:**
```bash
# Cần tenant + property manager
"AND('OrgTenantMSP.peer','OrgPropMSP.peer')"
```

**Implementation:**
- Sử dụng **State-Based Endorsement** (SBE)
- Set policy khác nhau cho từng key/asset
- Trong chaincode: `ctx.stub.setStateValidationParameter(...)`

---

## 🔧 CÁCH THAY ĐỔI ENDORSEMENT POLICY

### **Bước 1: Cập nhật chaincode deployment**

**File:** `network/cc-deploy.sh`

```bash
# Thay đổi từ:
--signature-policy "OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')"

# Sang (ví dụ MAJORITY):
--signature-policy "OutOf(2, 'OrgPropMSP.peer', 'OrgTenantMSP.peer', 'OrgLandlordMSP.peer')"
```

### **Bước 2: Upgrade chaincode**

```bash
cd network

# Update CC_VERSION và CC_SEQUENCE
export CC_VERSION="2.4.0"
export CC_SEQUENCE=2

# Chạy upgrade
./cc-upgrade.sh
```

### **Bước 3: Verify**

```bash
peer lifecycle chaincode querycommitted -C rentalchannel -n real-estate-cc
```

---

## 📝 STATE-BASED ENDORSEMENT (SBE)

### **Khái niệm:**
Set endorsement policy khác nhau cho **từng key/asset** riêng biệt.

### **Ví dụ trong chaincode:**

```javascript
// contract.js
async CreateContract(ctx, contractId, ...) {
    // Tạo contract
    const contract = { ... };
    await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));
    
    // Set endorsement policy riêng cho contract này
    // YÊU CẦU: Landlord + Tenant phải endorse mọi update
    const endorsementPolicy = {
        identities: [
            { role: { name: 'member', mspId: 'OrgLandlordMSP' }},
            { role: { name: 'member', mspId: 'OrgTenantMSP' }}
        ],
        policy: {
            '2-of': [{ 'signed-by': 0 }, { 'signed-by': 1 }]
        }
    };
    
    await ctx.stub.setStateValidationParameter(
        contractId, 
        Buffer.from(JSON.stringify(endorsementPolicy))
    );
}
```

**Kết quả:**
- Contract `CT-001` chỉ có thể update nếu cả Landlord + Tenant endorse
- Các keys khác vẫn dùng default policy

---

## 🎯 VERIFY ENDORSEMENT TRONG TRANSACTION

### **Xem endorsements trong block:**

```bash
# Block 24 - Transaction có endorsements
jq '.data.data[0].payload.data.actions[0].payload.action.endorsements' block_24.json
```

**Output:**
```json
[
  {
    "endorser": {
      "mspid": "OrgPropMSP",
      "id_bytes": "..."
    },
    "signature": "MEUCIQDa..."
  },
  {
    "endorser": {
      "mspid": "OrgTenantMSP",
      "id_bytes": "..."
    },
    "signature": "MEQCIG..."
  },
  {
    "endorser": {
      "mspid": "OrgLandlordMSP",
      "id_bytes": "..."
    },
    "signature": "MEYCIQCy..."
  }
]
```

**Giải thích:**
- Transaction này được endorse bởi CẢ 3 orgs
- Dù policy chỉ yêu cầu 1, nhưng client gửi đến cả 3 peers
- Validation sẽ check: Có ít nhất 1 endorsement hợp lệ không?

---

## 🚀 BEST PRACTICES

### **1. Match Policy với Business Logic**
```
✅ Payment transactions → Tenant + PropManager
✅ Contract creation → Landlord + PropManager
✅ Inspection reports → All 3 parties
```

### **2. Balance Security vs Performance**
```
✅ High value → AND policy (all orgs)
✅ Medium value → OutOf(2,3) (majority)
✅ Low value → OR policy (any org)
```

### **3. Use State-Based Endorsement**
```
✅ Different assets → Different policies
✅ Sensitive data → Stricter policy
✅ Public data → Relaxed policy
```

### **4. Test Endorsement Failures**
```
✅ Simulate peer down scenarios
✅ Test with insufficient endorsements
✅ Monitor endorsement latency
```

---

## 📊 ENDORSEMENT FLOW

```
┌──────────────────────────────────────────────────┐
│ 1. Client sends proposal to Endorsing Peers     │
│    (Based on endorsement policy)                │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│ 2. Each Peer executes chaincode                 │
│    - Simulates transaction                      │
│    - Generates RWSet                            │
│    - Signs response (endorsement)               │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│ 3. Client collects endorsements                 │
│    - Waits for required endorsements            │
│    - Checks policy satisfaction                 │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│ 4. Client sends to Orderer                      │
│    - Transaction + Endorsements                 │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│ 5. Orderer creates Block                        │
│    - Batches transactions                       │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│ 6. Peers validate endorsements                  │
│    - Check signatures                           │
│    - Verify endorsement policy satisfied        │
│    - MVCC check                                 │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│ 7. Commit if VALID                              │
│    - Update World State                         │
│    - Add block to blockchain                    │
└──────────────────────────────────────────────────┘
```

---

## 📝 TÓM TẮT

| Khía Cạnh | Giá Trị Hiện Tại |
|-----------|------------------|
| **Có Endorsement Policy?** | ✅ CÓ |
| **Type** | Signature-based |
| **Current Rule** | `OR(Prop, Tenant, Landlord)` |
| **Minimum Endorsers** | 1 peer from any org |
| **Security Level** | Medium (permissive) |
| **Configured At** | Channel + Chaincode level |
| **State-Based EP** | ❌ Chưa implement |
| **Recommendation** | Nên dùng MAJORITY hoặc SBE |

---

## 🔗 XEM THÊM

- `config/configtx.yaml` - Channel-level policies
- `network/cc-deploy.sh` - Chaincode endorsement policy
- `BLOCK_QUERY_GUIDE.md` - Xem endorsements trong blocks
- `TRANSACTION_FLOW_DIAGRAM.md` - Transaction lifecycle

