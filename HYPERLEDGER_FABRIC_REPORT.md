# Báo cáo đánh giá hệ thống Hyperledger Fabric

## 1. Tóm tắt điều hành
Hệ thống "Real Estate Rental Network" đã triển khai thành công một mạng Hyperledger Fabric phiên bản 2.5.x với cấu hình bao gồm 1 tổ chức orderer (OrdererOrg) và 3 tổ chức ứng dụng (OrgProp, OrgTenant, OrgLandlord). Mạng sử dụng cơ chế đồng thuận etcdraft (RAFT) với TLS bật cho toàn bộ thành phần, hỗ trợ quản lý hợp đồng thuê bất động sản, ký số, thanh toán, gia hạn và xử lý dữ liệu nhạy cảm qua Private Data Collection. Các script hỗ trợ hoàn chỉnh quy trình khởi tạo định danh, khởi động mạng, join channel và triển khai chaincode. Hyperledger Explorer được cấu hình để giám sát mạng.

## 2. So sánh Hyperledger Fabric với các nền tảng blockchain permissioned khác
| Tiêu chí | Hyperledger Fabric | Ethereum/Quorum | Corda |
| --- | --- | --- | --- |
| **Mô hình kiến trúc** | Modular, channel-based, tách rời consensus, membership service | EVM-based, single ledger, rely on consensus variants (IBFT, QBFT) | Point-to-point flows, notary service |
| **Quản trị danh tính** | MSP, CA nội bộ, NodeOUs, ABAC | Permissioned mode nhưng danh tính quản lý ngoài chuỗi | Identity dựa trên certificate nhưng flow lập trình phức tạp |
| **Bảo mật dữ liệu** | Channel + Private Data Collection + LevelDB/CouchDB | Hỗ trợ "private transaction" nhưng dữ liệu vẫn lan truyền tới validators | State chia sẻ theo cặp, khó mở rộng đa bên |
| **Ngôn ngữ hợp đồng** | Chaincode (Go, Node.js, Java) | Solidity | JVM (Kotlin/Java) |
| **Khả năng mở rộng nghiệp vụ** | Phù hợp quy trình đa doanh nghiệp, chính sách định tuyến linh hoạt | Mạnh về DeFi nhưng khó kiểm soát truy cập | Phù hợp hợp đồng song phương, không tối ưu khi >2 tổ chức |
| **Thông lượng & tính xác định** | Giao dịch xác định (endorsement) trước khi commit; throughput cao khi cấu hình phù hợp | Depends on consensus và gas model | Thông lượng vừa phải, phụ thuộc notary |

Fabric nổi bật nhờ khả năng phân tách dữ liệu theo channel/collection và cơ chế endorsement đảm bảo tính xác định giao dịch, phù hợp bài toán thuê bất động sản với nhiều tổ chức và dữ liệu nhạy cảm.

## 3. Kiến trúc mạng hiện có
- **Tổ chức & thành phần chính:**
  - OrdererOrg với ít nhất 1 orderer (`orderer1.ordererorg.example.com`) chạy etcdraft (config: `config/configtx.yaml`, `docker/docker-compose.yaml`).
  - Ba tổ chức ngang hàng (OrgProp, OrgTenant, OrgLandlord), mỗi tổ chức có 1 peer sử dụng CouchDB làm state database.
  - Mỗi tổ chức có một Fabric CA độc lập (`docker/docker-compose.yaml`), phát hành danh tính và TLS. 
- **Channel:** `rentalchannel` (profile `RentalChannel` trong `config/configtx.yaml`) có đủ 3 tổ chức ứng dụng tham gia.
- **Cơ chế đồng thuận:** etcdraft với BatchTimeout 2s, MaxMessageCount 10, PreferredMaxBytes 512KB.
- **Hạ tầng triển khai:** Docker Compose (`docker/docker-compose.yaml`) cấu hình network `fabric_real_estate_net`, mount toàn bộ MSP/TLS từ `organizations/`.
- **NodeOUs & MSP:** Script `network/register-enroll.sh` tự động tạo `config.yaml` NodeOUs cho từng MSP; `prepare_org_msp` đảm bảo cấu trúc MSP chuẩn.
- **TLS & bảo mật:** Tất cả các thành phần bật TLS, orderer yêu cầu mutual TLS (`orderer.yaml` – `ClientAuthRequired: true`).
- **Quản trị & giám sát:**
  - Script `network/peer-join.sh` join peers và cập nhật anchor peer.
  - Hyperledger Explorer (`explorer/`) cung cấp giao diện giám sát block/transaction, channel topology.

## 4. Quản lý danh tính và chứng thực
- **Certificate Authority:** `network/ca-up.sh` khởi chạy 4 CA containers. Script `network/register-enroll.sh` đảm nhiệm:
  - Enroll admin CA, đảm bảo affiliations `<org>` và `<org>.department1` tồn tại.
  - Register peer, admin, user với attributes cụ thể (`role=landlord`, `role=tenant`).
  - Enroll MSP và TLS cho peer/orderer/admin, tạo cấu trúc `msp/`, `tls/` đầy đủ.
- **MSP & NodeOUs:** `config/configtx.yaml` bật NodeOUs, phân biệt `client`, `peer`, `admin`, `orderer`. Các MSP node copy config tự động.
- **Attribute-Based Access Control (ABAC):** Chaincode đọc thuộc tính `role` từ certificate thông qua `ctx.clientIdentity.getAttributeValue('role')` để hạn chế các hàm (tạo hợp đồng chỉ landlord, thanh toán chỉ tenant...).

## 5. Thiết kế ledger và dữ liệu
- **State Database:** CouchDB được sử dụng cho cả 3 peer, credentials `admin/adminpw`. Tập chỉ mục JSON trong `chaincode/real-estate-cc/META-INF` tối ưu truy vấn theo `status`, `ownerOrgMSP`, `tenant`, `landlord`, `payment period`,…
- **Private Data Collections:**
  - `contractPrivate` & `paymentPrivate` (`chaincode/real-estate-cc/collections_config.json`) chia sẻ giữa cả 3 tổ chức, `requiredPeerCount=1`, `maxPeerCount=3`, `blockToLive=1000`, chỉ cho phép thành viên đọc/ghi.
- **State-Based Endorsement:** Khi tạo hợp đồng, chaincode thiết lập SBE `AND('OrgPropMSP.member','OrgTenantMSP.member')` để các cập nhật tiếp theo phải được hai bên landlord/tenant đồng thuận.
- **Sự kiện:** Chaincode phát các event như `ContractCreated`, `TenantSigned`, `FirstPaymentRecorded`, `ContractExtended`, hỗ trợ ứng dụng ngoại vi bắt kịp trạng thái.

## 6. Chức năng chaincode `RealEstateContract`
- **Tạo và ký hợp đồng:** `CreateContract` kiểm tra đầy đủ tham số, định danh người tạo (landlord) & MSP, lưu hash hợp đồng. `TenantSignContract` cập nhật trạng thái `WAIT_DEPOSIT` và lưu metadata chữ ký người thuê.
- **Ký quỹ & thanh toán:** `RecordDeposit` ghi nhận ký quỹ của landlord/tenant; `RecordFirstPayment` xác nhận thanh toán đầu tiên (kiểm tra khớp `rentAmount`) và chuyển trạng thái `ACTIVE`.
- **Lịch thanh toán định kỳ & gia hạn:**
  - `CreateMonthlyPaymentSchedule` sinh lịch thanh toán theo chu kỳ 5 giờ (mô phỏng, nên điều chỉnh thành tháng khi đưa vào thực tế) bằng composite key `payment~contractId~period`.
  - `RecordContractExtension` & `CreateExtensionPaymentSchedule` xử lý gia hạn hợp đồng và tạo lịch thanh toán mới.
- **Quản lý phạt & kết thúc hợp đồng:** `RecordPenalty` cho phép các bên hoặc admin ghi nhận tiền phạt; `TerminateContract` cập nhật trạng thái `TERMINATED`, lưu lý do và người thực hiện.
- **Dữ liệu nhạy cảm:** `StoreContractPrivateDetails` và `GetContractPrivateDetails` quản lý thông tin hợp đồng trong `contractPrivate`, đảm bảo chỉ các tổ chức thành viên truy cập.

## 7. Quy trình vận hành và công cụ
1. **Chuẩn bị binary/image:** `network/bootstrap.sh` tải Fabric binaries (2.5.12) và CA (1.5.15) nếu thiếu.
2. **Khởi chạy CA:** `network/ca-up.sh`.
3. **Đăng ký & enroll:** `network/register-enroll.sh` xây dựng toàn bộ MSP, TLS cho orderer/peers/users.
4. **Khởi tạo channel:** `network/genesis-channel.sh` (tạo block) và `network/peer-join.sh` (join + anchor peer update).
5. **Triển khai chaincode:** `network/cc-deploy.sh` (package, install, approve x3, commit) với policy `OR('OrgPropMSP.peer','OrgTenantMSP.peer','OrgLandlordMSP.peer')` và collections.
6. **Khởi chạy Hyperledger Explorer:** `network/explorer-up.sh` cho giao diện quan sát.

## 8. Thông số cấu hình then chốt
| Thành phần | Tham số | Giá trị | Nguồn |
| --- | --- | --- | --- |
| Orderer (etcdraft) | `BatchTimeout` | 2s | `config/configtx.yaml` |
| Orderer | `MaxMessageCount` | 10 | `config/configtx.yaml` |
| Orderer Admin API | TLS mutual auth | `orderer.yaml`, `docker/docker-compose.yaml` |
| Peer | State DB | CouchDB (`admin/adminpw`) | `docker/docker-compose.yaml` |
| Peer TLS | Enabled, CA root per org | `config/core.yaml`, `docker/docker-compose.yaml` |
| PDC | `blockToLive` | 1000 | `collections_config.json` |
| Chaincode version | `real-estate-cc` v2.4.1 | `chaincode/real-estate-cc/package.json` |
| Fabric binaries | v2.5.12, Fabric CA v1.5.15 | `network/bootstrap.sh` |
| Explorer | Default creds `exploreradmin/exploreradminpw` | `README.md`, `explorer/README.md` |

## 9. Các thành tựu & điểm mạnh
- Kiến trúc 3 tổ chức cân bằng, sử dụng TLS/NodeOUs chuẩn, cho phép mở rộng thêm peer dễ dàng.
- Chaincode kiểm soát truy cập chi tiết bằng MSP và thuộc tính `role`, tận dụng SBE đảm bảo landlord & tenant cùng phê duyệt.
- Private Data Collection bảo vệ thông tin hợp đồng/ thanh toán, chỉ mục CouchDB giúp truy vấn hiệu quả.
- Bộ script tự động hóa toàn bộ vòng đời triển khai (CA → MSP → channel → chaincode), giảm sai sót thủ công.
- Tích hợp Hyperledger Explorer cho quan sát trực quan.

## 10. Hạn chế & khuyến nghị
1. **Độ sẵn sàng cao cho Orderer:** Hiện RAFT cluster mới có `orderer1`. Nên bổ sung `orderer2`, `orderer3` (cập nhật `config/configtx.yaml`, `docker/docker-compose.yaml`) và cấu hình load balancing/health-check để tránh single point of failure.
2. **Chu kỳ thanh toán thực tế:** Điều chỉnh `CreateMonthlyPaymentSchedule` từ chu kỳ 5 giờ về lịch hàng tháng; bổ sung kiểm thử tự động đảm bảo tính toán ngày (cuối tháng, năm nhuận).
3. **Tự động hóa kiểm thử chaincode:** Thêm script `npm test` hoặc `fabric-chaincode-node test` với unit test/ledger mock; tích hợp CI.
4. **Giám sát & vận hành:** Kích hoạt endpoints metrics (`CORE_OPERATIONS_LISTENADDRESS`, `ORDERER_OPERATIONS_LISTENADDRESS`) và triển khai Prometheus/Grafana. Xem xét log aggregation tập trung.
5. **Quản trị chứng thư:** Thêm quy trình xoay vòng chứng chỉ, backup MSP, hạn chế phơi bày port CA sau khi enroll.
6. **Bảo mật ứng dụng:** Đảm bảo client-side kiểm soát truy cập phù hợp với chaincode (đối chiếu `role` attributes) và triển khai audit log ngoài chuỗi.

## 11. Kết luận
Hệ thống đã đáp ứng cấu trúc mạng Hyperledger Fabric tiêu chuẩn cho bài toán thuê bất động sản đa tổ chức, kết hợp đầy đủ các cơ chế bảo mật (TLS, MSP, ABAC, PDC). Các điểm cần cải thiện chủ yếu liên quan đến mở rộng độ sẵn sàng, hoàn thiện logic nghiệp vụ thực tế và bổ sung giám sát/kiểm thử. Với các khuyến nghị trên, mạng có thể tiến tới môi trường sản xuất ổn định, an toàn và dễ vận hành.
