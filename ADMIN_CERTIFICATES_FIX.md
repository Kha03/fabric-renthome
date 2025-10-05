# Giải Quyết Vấn Đề Channel Configuration - Admin Certificates

## Vấn đề
Các admin certificates mới được tạo chưa được Fabric channel nhận biết, dẫn đến việc admin operations có thể bị từ chối hoặc không hoạt động đúng cách.

## Root Cause Analysis
Khi kiểm tra channel configuration, phát hiện rằng trong MSP configuration của các organizations, phần `admins` đang trống (`"admins": []`). Điều này có nghĩa là channel không nhận biết admin certificates nào, mặc dù chúng đã tồn tại trong filesystem.

## Giải pháp thực hiện

### 1. Phân tích vấn đề
```bash
# Fetch channel configuration
peer channel fetch config config_block.pb -c rentalchannel

# Decode để phân tích
configtxlator proto_decode --input config_block.pb --type common.Block | jq .data.data[0].payload.data.config > config.json

# Kiểm tra MSP configuration
jq '.channel_group.groups.Application.groups.OrgPropMSP.values.MSP.value.config.admins | length' config.json
# Kết quả: 0 (không có admin certificates)
```

### 2. Script update admin certificates
Tạo script `update-admin-certs.sh` để:
- Fetch current channel configuration
- Extract admin certificates từ filesystem
- Encode certificates thành base64
- Update MSP configuration cho tất cả organizations
- Sign với các admin hiện tại
- Submit configuration update transaction

### 3. Kết quả
Sau khi chạy script:
```bash
./update-admin-certs.sh
```

Channel configuration đã được cập nhật thành công:
- OrgPropMSP: 1 admin certificate
- OrgLandlordMSP: 1 admin certificate  
- OrgTenantMSP: 1 admin certificate
- Block height tăng từ 25 lên 26 (configuration update committed)

### 4. Verification
Tất cả admin operations đã hoạt động bình thường:
```bash
./verify-admin-access.sh
```

Các admin từ 3 organizations đều có thể:
- Query chaincode thành công
- Thực hiện admin operations trên channel
- Access các peer functions

## Files được tạo
1. `update-admin-certs.sh` - Script chính để update admin certificates
2. `verify-admin-access.sh` - Script verification
3. `config.json` - Channel configuration backup
4. `verification_config.json` - Post-update configuration

## Technical Details

### Channel Configuration Update Process
1. **Fetch**: Lấy current configuration block
2. **Decode**: Chuyển protobuf thành JSON
3. **Modify**: Thêm admin certificates vào MSP config
4. **Encode**: Chuyển JSON về protobuf
5. **Compute Update**: Tạo delta transaction
6. **Sign**: Collect signatures từ các admins
7. **Submit**: Gửi update lên orderer

### MSP Configuration Structure
```json
{
  "channel_group": {
    "groups": {
      "Application": {
        "groups": {
          "OrgPropMSP": {
            "values": {
              "MSP": {
                "value": {
                  "config": {
                    "admins": ["<base64-encoded-admin-cert>"],
                    "root_certs": ["<base64-encoded-ca-cert>"],
                    ...
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Best Practices
1. **Backup**: Luôn backup channel configuration trước khi update
2. **Verification**: Test admin operations sau mỗi update
3. **Documentation**: Ghi lại tất cả changes cho audit trail
4. **Multi-signature**: Đảm bảo có đủ signatures từ các admins required

## Troubleshooting
Nếu gặp lỗi tương tự trong tương lai:
1. Kiểm tra MSP configuration: `jq '.channel_group.groups.Application.groups.*.values.MSP.value.config.admins | length' config.json`
2. Verify admin certificates tồn tại: `ls organizations/peerOrganizations/*/users/Admin*/msp/signcerts/`
3. Check channel policy requirements cho configuration updates
4. Ensure proper signatures từ các required admins

## Status
✅ **RESOLVED** - Admin certificates đã được cập nhật thành công vào channel configuration và tất cả admin operations hoạt động bình thường.

**Update 2025-09-10**: 
- Channel configuration block height: 25 (configuration update committed)
- Tất cả 3 organizations (OrgProp, OrgLandlord, OrgTenant) đều có 1 admin certificate
- Verification script xác nhận tất cả admin operations hoạt động thành công

---
*Cập nhật lần cuối: 2025-09-10*
