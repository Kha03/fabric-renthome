# Cải Tiến Bảo Mật Chaincode Real Estate

## Tổng quan

Chaincode đã được cải tiến với hệ thống xác thực identity chặt chẽ để đảm bảo rằng chỉ những người dùng được ủy quyền mới có thể thực hiện các operations cụ thể.

## Các Cải Tiến Chính

### 1. Identity Validation Helpers

#### `_extractUserIdFromIdentity(clientIdentity)`
- Trích xuất user ID từ client identity string của Fabric
- Parse CN (Common Name) từ certificate identity
- Format chuẩn: "CN=user,OU=client,O=Org,C=US::CN=ca.org.example.com,O=org.example.com,C=US"

#### `_validateCallerIdentity(ctx, expectedUserId, expectedMSP)`
- Kiểm tra cả MSP và user identity của caller
- Đảm bảo caller chính xác là user được mong đợi
- Ném lỗi nếu không khớp

#### `_validateCallerIsParty(ctx, contract)`
- Kiểm tra caller là landlord hoặc tenant của contract
- Trả về thông tin role của caller
- Sử dụng cho các operations cần authorization từ bất kỳ bên nào

#### `_validateReadAccess(ctx, contract)`
- Kiểm tra quyền đọc contract
- Hiện tại chỉ cho phép các bên trong contract

#### `_isAdmin(ctx)`
- Kiểm tra caller có phải admin không
- Kiểm tra AdminMSP hoặc role attribute 'admin'/'regulator'

#### `_validateCallerIsPartyOrAdmin(ctx, contract)`
- Kiểm tra caller là landlord, tenant, hoặc admin
- Sử dụng cho các operations cần admin access (penalty operations)

### 2. Cải Tiến Các Phương Thức

#### `CreateContract`
- **Trước**: Chỉ kiểm tra MSP của creator
- **Sau**: Kiểm tra cả MSP và identity, đảm bảo caller chính xác là landlordId

#### `TenantSignContract`
- **Trước**: Chỉ kiểm tra tenantMSP
- **Sau**: Kiểm tra cả tenantMSP và tenantId chính xác
- Thêm audit trail với actual signer và expected signer

#### `RecordFirstPayment`
- **Trước**: Chỉ kiểm tra tenantMSP
- **Sau**: Kiểm tra cả tenantMSP và tenantId chính xác
- Thêm audit trail với actual payer và expected payer

#### `RecordPayment`
- **Trước**: Chỉ kiểm tra tenantMSP
- **Sau**: Kiểm tra cả tenantMSP và tenantId chính xác
- Thêm audit trail với actual payer và expected payer

#### `RecordDeposit`
- **Trước**: Không có validation identity
- **Sau**: Kiểm tra caller identity khớp với party (landlord/tenant)
- Thêm audit trail với actual depositor và expected depositor

#### `TerminateContract`
- **Trước**: Không có validation, bất kỳ ai cũng có thể terminate
- **Sau**: Chỉ landlord hoặc tenant mới có thể terminate
- Thêm thông tin về role của người terminate

#### `RecordPenalty`
- **Trước**: Không có validation identity
- **Sau**: Các bên trong contract HOẶC admin có thể record penalty
- Thêm audit trail với recorder identity và role (admin/landlord/tenant)

#### `ApplyPenalty`
- **Trước**: Không có validation identity
- **Sau**: Các bên trong contract HOẶC admin có thể apply penalty
- Thêm audit trail với applier identity và role (admin/landlord/tenant)

#### `GetContract`
- **Trước**: Bất kỳ ai cũng có thể đọc
- **Sau**: Chỉ các bên trong contract mới có thể đọc

### 3. Audit Trail Enhancements

Tất cả các operations quan trọng giờ đều ghi lại:
- `actualPerformer`: User thực sự thực hiện operation
- `expectedPerformer`: User dự kiến thực hiện operation
- `performerRole`: Role của performer (landlord/tenant)
- Timestamp chính xác

### 4. Error Messages Cải Tiến

Các lỗi validation giờ cung cấp thông tin chi tiết:
- Actual caller identity và MSP
- Expected identity và MSP
- Clear error messages giúp debug

## Lợi Ích Bảo Mật

### 1. Ngăn Chặn Identity Spoofing
- Không thể dùng certificate khác trong cùng MSP để thực hiện operations
- Mỗi user chỉ có thể thực hiện operations được assign cho họ

### 2. Audit Trail Đầy Đủ
- Theo dõi được chính xác ai đã thực hiện operation nào
- So sánh được between expected vs actual performer
- Hỗ trợ compliance và investigation

### 3. Role-based Access Control
- **Landlord**: Tạo contract, ký contract như landlord, terminate contract, record/apply penalty
- **Tenant**: Ký contract, thanh toán, terminate contract, record/apply penalty  
- **Admin**: Record penalty, apply penalty (không cần xác thực là tenant/landlord)
- **Read Access**: Chỉ các bên trong contract + admin có thể đọc contract details

### 4. Data Integrity
- Đảm bảo chỉ đúng người mới có thể modify data liên quan đến họ
- Ngăn chặn unauthorized modifications

## Cấu Hình Admin

### Admin MSPs
Để một MSP được coi là admin, cần cấu hình trong chaincode:
```javascript
const adminMSPs = ['OrdererMSP', 'AdminMSP']; // Thêm MSP IDs của admin vào đây
```

### Admin Role Attributes
Hoặc có thể sử dụng role attributes trong certificate:
```json
{
  "role": "admin"  // hoặc "regulator"
}
```

### Admin Operations
Admin có thể thực hiện:
- `RecordPenalty`: Ghi nhận phạt cho landlord/tenant
- `ApplyPenalty`: Áp dụng phạt cho payment periods
- Các operations này không cần xác thực identity khớp với tenant/landlord

## Cách Sử Dụng

### Client Application
```javascript
// Khi call chaincode, đảm bảo sử dụng đúng identity
const identity = await gateway.getIdentity();
// Identity phải match với tenantId/landlordId trong contract

// Ví dụ: Tenant ký contract
await contract.submitTransaction('TenantSignContract', 
    contractId, 
    fullySignedHash, 
    signatureMeta
);
// Chỉ thành công nếu caller identity == contract.tenantId
```

### Admin Operations
```javascript
// Admin có thể áp dụng phạt mà không cần xác thực tenant/landlord
const adminGateway = await Gateway.connect(connectionProfile, {
    identity: adminUser, // User có AdminMSP hoặc role 'admin'
    // ...
});

await contract.submitTransaction('RecordPenalty', 
    contractId, 
    'tenant',  // party bị phạt
    '1000000', // amount (in cents)
    'Late payment violation'
);
```

### Error Handling
```javascript
try {
    await contract.submitTransaction('TenantSignContract', contractId, hash, meta);
} catch (error) {
    if (error.message.includes('does not match expected user')) {
        // Handle identity mismatch
        console.log('Wrong user trying to sign contract');
    }
}
```

## Version History

- **v2.0.0**: MSP-based validation
- **v2.1.0**: Strict identity validation với user-level checks và audit trails

## Compliance

Chaincode hiện đã đáp ứng các yêu cầu:
- ✅ Identity validation chặt chẽ
- ✅ Audit trail đầy đủ
- ✅ Role-based access control
- ✅ Data integrity protection
- ✅ Authorization cho mọi critical operations