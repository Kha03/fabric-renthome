# 🔄 Transaction Flow - Minh Họa Chi Tiết

## 📊 Ví Dụ Thực Tế: Cập Nhật Payment Status

### Bước 1: Trạng thái ban đầu

**Block 25 (đã commit):**
```
┌─────────────────────────────────────────────────┐
│ Block 25                                        │
├─────────────────────────────────────────────────┤
│ Transaction: CreateMonthlyPaymentSchedule       │
│ ├─ Write: payment-002 → Status: SCHEDULED      │
│ ├─ Write: payment-003 → Status: SCHEDULED      │
│ └─ ... (9 writes khác)                         │
└─────────────────────────────────────────────────┘
```

**World State (Current):**
```
Key: payment~CT-20251021-ZTRPNI~002~
Value: {
  "paymentId": "...-payment-002",
  "period": 2,
  "amount": 7000000,
  "status": "SCHEDULED",  ← Trạng thái hiện tại
  "dueDate": "2025-10-21T16:37:20.815Z"
}
Version: Block 25, Tx 0
```

---

### Bước 2: Client gửi transaction cập nhật

```bash
# Tenant thanh toán kỳ 2
./network/cc-invoke.sh RecordPayment CT-20251021-ZTRPNI 2 7000000 order-xyz
```

**Điều gì xảy ra?**

1. **Client → Endorsing Peers**
```
┌──────────┐       RecordPayment()        ┌──────────────┐
│ Client   │ ──────────────────────────→  │ Peer0.Prop   │
│ (Tenant) │                               │ Peer0.Tenant │
└──────────┘                               │ Peer0.Land.. │
                                           └──────────────┘
```

2. **Peers Execute Chaincode (Simulation)**
```javascript
async RecordPayment(ctx, contractId, period, amount, orderRef) {
  // READ: Đọc payment hiện tại
  const paymentKey = ctx.stub.createCompositeKey('payment', [...]);
  const paymentBytes = await ctx.stub.getState(paymentKey); ← READ
  
  const payment = JSON.parse(paymentBytes);
  // Current: { status: "SCHEDULED", amount: 7000000 }
  
  // WRITE: Cập nhật payment
  payment.status = "PAID";
  payment.paidAt = new Date().toISOString();
  payment.orderRef = orderRef;
  
  await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(payment))); ← WRITE
}
```

3. **Tạo Read-Write Set (RWSet)**
```json
{
  "reads": [
    {
      "key": "payment~CT-20251021-ZTRPNI~002~",
      "version": {
        "block_num": "25",  ← Đọc từ block 25
        "tx_num": "0"
      }
    }
  ],
  "writes": [
    {
      "key": "payment~CT-20251021-ZTRPNI~002~",
      "value": {
        "status": "PAID",  ← Giá trị MỚI
        "paidAt": "2025-10-22T14:30:00Z",
        "orderRef": "order-xyz"
      }
    }
  ]
}
```

4. **Peers Endorse (Sign)**
```
┌──────────────┐
│ Peer0.Prop   │ ✅ Endorsement Signature 1
│ Peer0.Tenant │ ✅ Endorsement Signature 2
│ Peer0.Land.. │ ✅ Endorsement Signature 3
└──────────────┘
```

---

### Bước 3: Client gửi lên Orderer

```
┌──────────┐                    ┌──────────┐
│ Client   │ ─── Proposal ────→ │ Orderer  │
│          │     + RWSet        │          │
│          │     + Endorsements │          │
└──────────┘                    └──────────┘
```

---

### Bước 4: Orderer tạo Block MỚI

```
┌─────────────────────────────────────────────────┐
│ Block 26 (NEW!)                                 │
├─────────────────────────────────────────────────┤
│ Previous Hash: rsepMuEtLyT+Liskzk82+ZghA2j... │ ← Link to Block 25
├─────────────────────────────────────────────────┤
│ Transaction #0:                                 │
│ TX ID: abc123...                                │
│                                                 │
│ RWSet:                                          │
│ ├─ Reads: payment-002 (v: Block 25, Tx 0)     │
│ └─ Writes: payment-002 → Status: PAID         │
└─────────────────────────────────────────────────┘
```

---

### Bước 5: Peers Validate và Commit

**Validation:**
```
For each peer:
  1. Verify endorsements ✅
  2. Check MVCC (read version conflict?) ✅
  3. Check endorsement policy satisfied? ✅
```

**MVCC Check:**
```
Read version in transaction: Block 25, Tx 0
Current version in ledger:   Block 25, Tx 0
→ MATCH! ✅ No conflict
```

**Commit:**
```
1. Add Block 26 to Blockchain ✅
2. Update World State:
   Key: payment~CT-20251021-ZTRPNI~002~
   Old Value: { status: "SCHEDULED", version: (25,0) }
   New Value: { status: "PAID", version: (26,0) } ← Updated!
```

---

### Bước 6: Kết quả cuối cùng

**Blockchain (Immutable History):**
```
Block 25 → Block 26 → Block 27 → ...
   ↓          ↓
 Status:    Status:
SCHEDULED   PAID
```

**World State (Current State):**
```
Key: payment~CT-20251021-ZTRPNI~002~
Value: {
  "status": "PAID",  ← Giá trị MỚI NHẤT
  "paidAt": "2025-10-22T14:30:00Z",
  "orderRef": "order-xyz"
}
Version: Block 26, Tx 0  ← Version mới
```

---

## 🔍 Query History

```bash
# Xem lịch sử thay đổi của payment-002
peer chaincode query ... GetHistory payment~CT-20251021-ZTRPNI~002~
```

**Kết quả:**
```json
[
  {
    "txId": "3e2addcf...",
    "timestamp": "2025-10-21T11:37:39Z",
    "isDelete": false,
    "value": {
      "status": "SCHEDULED",  ← Version 1
      "amount": 7000000
    }
  },
  {
    "txId": "abc123...",
    "timestamp": "2025-10-22T14:30:00Z",
    "isDelete": false,
    "value": {
      "status": "PAID",  ← Version 2
      "amount": 7000000,
      "paidAt": "2025-10-22T14:30:00Z"
    }
  }
]
```

---

## ⚠️ MVCC Conflict Example

### Scenario: 2 transactions đồng thời cập nhật cùng 1 key

**Time T0: Current State**
```
Key: CT-20251021-ZTRPNI
Value: { rentAmount: 7000000 }
Version: Block 24, Tx 0
```

**Time T1: Transaction A và B đều đọc cùng lúc**
```
Transaction A:                    Transaction B:
├─ Read: rentAmount = 7000000    ├─ Read: rentAmount = 7000000
│  Version: (24, 0)              │  Version: (24, 0)
├─ Update to: 8000000            ├─ Update to: 7500000
└─ Endorse ✅                    └─ Endorse ✅
```

**Time T2: Orderer tạo Block 26**
```
Block 26:
└─ Transaction A (first!)
   ├─ Read version: (24, 0)
   └─ Write: rentAmount = 8000000
```

**Time T3: Peers Validate Transaction A**
```
Read version in TX:    (24, 0)
Current version:       (24, 0)
→ VALID ✅ Commit!

World State updated:
  rentAmount = 8000000
  Version: (26, 0)  ← New version!
```

**Time T4: Orderer tạo Block 27**
```
Block 27:
└─ Transaction B (second)
   ├─ Read version: (24, 0)  ← Old version!
   └─ Write: rentAmount = 7500000
```

**Time T5: Peers Validate Transaction B**
```
Read version in TX:    (24, 0)  ← Old!
Current version:       (26, 0)  ← Newer!
→ MVCC CONFLICT ❌ INVALID!

Transaction B is marked as INVALID in Block 27
World State NOT updated
```

**Kết quả:**
```
Block 26: TX A ✅ VALID   → rentAmount = 8000000
Block 27: TX B ❌ INVALID → rentAmount still 8000000
```

---

## 💡 Key Takeaways

1. **Immutability**: Block 25 vẫn còn, không thay đổi
2. **New Block**: Cập nhật tạo Block 26 mới
3. **World State**: Lưu version mới nhất (Block 26)
4. **History**: Query blockchain để xem tất cả versions
5. **MVCC**: Ngăn chặn concurrent update conflicts
6. **1 TX → N Writes**: 1 transaction có thể ghi nhiều keys

