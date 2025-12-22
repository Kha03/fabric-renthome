# 📚 Giải Thích Cách Hyperledger Fabric Xử Lý Writes

## 🔑 Khái Niệm Quan Trọng

### 1. **Transaction vs Write Operations**

Trong Hyperledger Fabric:
- **1 Transaction** = 1 lần gọi chaincode function
- **1 Transaction** có thể chứa **NHIỀU write operations**

### 2. **Immutability (Tính Bất Biến)**

> ⚠️ **QUAN TRỌNG**: Blockchain là IMMUTABLE (bất biến)
> - Bạn **KHÔNG THỂ** sửa đổi block cũ
> - Bạn **KHÔNG THỂ** xóa block cũ
> - Bạn **KHÔNG THỂ** ghi đè lên block cũ

## 📦 Phân Tích Block 25

### Cấu trúc:
```
Block 25
└── Transaction #1 (ID: 3e2addcf...)
    └── Function Call: CreateMonthlyPaymentSchedule(contractId)
        ├── Write #1: payment~CT-20251021-ZTRPNI~002~ (period 2)
        ├── Write #2: payment~CT-20251021-ZTRPNI~003~ (period 3)
        ├── Write #3: payment~CT-20251021-ZTRPNI~004~ (period 4)
        ├── Write #4: payment~CT-20251021-ZTRPNI~005~ (period 5)
        ├── Write #5: payment~CT-20251021-ZTRPNI~006~ (period 6)
        ├── Write #6: payment~CT-20251021-ZTRPNI~007~ (period 7)
        ├── Write #7: payment~CT-20251021-ZTRPNI~008~ (period 8)
        ├── Write #8: payment~CT-20251021-ZTRPNI~009~ (period 9)
        ├── Write #9: payment~CT-20251021-ZTRPNI~010~ (period 10)
        ├── Write #10: payment~CT-20251021-ZTRPNI~011~ (period 11)
        └── Write #11: payment~CT-20251021-ZTRPNI~012~ (period 12)
```

### Tại sao có nhiều Payments trong 1 Block?

**Chaincode function `CreateMonthlyPaymentSchedule()` thực hiện:**

```javascript
async CreateMonthlyPaymentSchedule(ctx, contractId) {
    // 1. Đọc contract
    const contract = ...;
    
    // 2. Tính toán các kỳ thanh toán (period 2 -> 12)
    let period = 2;
    while (currentDate < endDate) {
        // 3. Tạo payment schedule cho mỗi kỳ
        const paymentKey = ctx.stub.createCompositeKey('payment', 
            [contractId, period.toString().padStart(3, '0')]);
        
        const paymentSchedule = { ... };
        
        // 4. GHI VÀO WORLD STATE (tất cả trong 1 transaction!)
        await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(paymentSchedule)));
        
        period++;
    }
    
    return schedules; // Return tất cả schedules
}
```

**Kết quả:**
- **1 lần invoke** function `CreateMonthlyPaymentSchedule`
- **→ 1 transaction**
- **→ 11 write operations** (tạo 11 payment schedules từ period 2-12)
- **→ Tất cả được commit vào 1 block duy nhất (Block 25)**

## 🔄 Cách Cập Nhật Dữ Liệu

### ❌ KHÔNG THỂ làm:
```
- Sửa block 25
- Xóa block 25
- Ghi đè dữ liệu trong block 25
```

### ✅ CÓ THỂ làm:
```
- Tạo BLOCK MỚI với transaction cập nhật
- Block mới sẽ chứa VERSION MỚI của dữ liệu
```

## 📝 Ví Dụ Cập Nhật

### Scenario 1: Cập Nhật Giá Hợp Đồng

**Block 24:**
```json
{
  "contractId": "CT-20251021-ZTRPNI",
  "rentAmount": 7000000,
  "status": "ACTIVE"
}
```

**Muốn cập nhật giá → Tạo transaction mới:**
```javascript
// Invoke chaincode
peer chaincode invoke ... -c '{"function":"UpdateRentAmount","Args":["CT-20251021-ZTRPNI","8000000"]}'
```

**Block 26 (BLOCK MỚI):**
```json
{
  "contractId": "CT-20251021-ZTRPNI",
  "rentAmount": 8000000,  // ← Giá mới
  "status": "ACTIVE",
  "updatedAt": "2025-10-22T14:00:00Z"
}
```

**Kết quả:**
- Block 24: Vẫn còn (immutable), chứa giá cũ 7,000,000
- Block 26: Block mới, chứa giá mới 8,000,000
- World State: Chỉ lưu version MỚI NHẤT (8,000,000)

### Scenario 2: Tạo Hợp Đồng Mới

**Invoke:**
```bash
./network/cc-invoke.sh CreateContract CT-20251022-NEW landlord1 tenant1 ...
```

**Block 27 (BLOCK MỚI):**
```json
{
  "contractId": "CT-20251022-NEW",
  "rentAmount": 10000000,
  "status": "PENDING_SIGNATURE"
}
```

### Scenario 3: Cập Nhật Payment Status

**Block 25:** Payment period 2 - Status: SCHEDULED

**Invoke:**
```bash
./network/cc-invoke.sh RecordPayment CT-20251021-ZTRPNI 2 7000000 order-ref-123
```

**Block 28 (BLOCK MỚI):**
```json
{
  "paymentId": "CT-20251021-ZTRPNI-payment-002",
  "period": 2,
  "amount": 7000000,
  "status": "PAID",  // ← Status mới
  "paidAt": "2025-10-22T14:30:00Z",
  "orderRef": "order-ref-123"
}
```

## 🔍 Read-Write Set (RWSet)

Mỗi transaction có **RWSet** gồm 2 phần:

### 1. **Read Set** (Đọc)
Các keys và versions được đọc trong transaction:
```json
{
  "reads": [
    {
      "key": "CT-20251021-ZTRPNI",
      "version": {
        "block_num": "24",
        "tx_num": "0"
      }
    }
  ]
}
```

**Mục đích:** 
- Phát hiện conflicts (MVCC - Multi-Version Concurrency Control)
- Đảm bảo data consistency

### 2. **Write Set** (Ghi)
Các keys và values được ghi trong transaction:
```json
{
  "writes": [
    {
      "key": "payment~CT-20251021-ZTRPNI~002~",
      "is_delete": false,
      "value": "eyJvYmp..." // Base64 encoded
    }
  ]
}
```

## ⚙️ Transaction Flow

```
1. Client invoke chaincode
   ↓
2. Endorsing peers thực thi chaincode
   → Tạo Read-Write Set (RWSet)
   ↓
3. Client gửi transaction lên Orderer
   ↓
4. Orderer tạo BLOCK MỚI với transactions
   ↓
5. Peers validate và commit block
   → Cập nhật World State
   → Thêm block vào blockchain (immutable!)
```

## 📊 World State vs Blockchain

### **World State** (Current State)
- Database hiện tại (LevelDB hoặc CouchDB)
- Chỉ lưu **VERSION MỚI NHẤT** của mỗi key
- **CÓ THỂ** thay đổi (cập nhật giá trị)

```
Key: CT-20251021-ZTRPNI
Value: { rentAmount: 8000000, ... } // Version mới nhất
```

### **Blockchain** (Historical Ledger)
- Chuỗi các blocks liên kết
- Lưu **TẤT CẢ LỊCH SỬ** thay đổi
- **KHÔNG THỂ** thay đổi (immutable)

```
Block 24: { rentAmount: 7000000 }
Block 26: { rentAmount: 8000000 }
Block 30: { rentAmount: 9000000 }
```

## 🎯 Tóm Tắt

| Khía Cạnh | Giải Thích |
|-----------|------------|
| **1 Transaction** | 1 lần gọi chaincode function |
| **Nhiều Writes** | 1 transaction có thể ghi nhiều keys |
| **1 Block** | Chứa 1 hoặc nhiều transactions |
| **Immutable** | Không thể sửa block cũ |
| **Cập nhật** | Tạo block MỚI với version mới |
| **World State** | Lưu version mới nhất |
| **Blockchain** | Lưu toàn bộ lịch sử |

## 💡 Best Practices

1. **Batch operations**: Gộp nhiều writes vào 1 transaction để giảm số blocks
2. **Versioning**: Luôn lưu version/timestamp khi cập nhật
3. **Audit trail**: Query blockchain để xem lịch sử thay đổi
4. **Conflict handling**: Xử lý MVCC conflicts khi có concurrent updates

## 🔗 Xem History của Key

```bash
# Xem lịch sử thay đổi của 1 key
peer chaincode query -C rentalchannel -n real-estate-cc \
  -c '{"function":"GetHistory","Args":["CT-20251021-ZTRPNI"]}'
```

Kết quả sẽ hiển thị tất cả versions qua các blocks khác nhau!

