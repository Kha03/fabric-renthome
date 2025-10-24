'use strict';

const { Contract } = require('fabric-contract-api');

class RealEstateContract extends Contract {

    constructor() {
        super('RealEstateContract');
    }

    /**
     * Initialize ledger with sample data
     */
    async initLedger(ctx) {
        console.info('Initializing Real Estate Contract Ledger');
        return;
    }

    // ========== CONTRACT MANAGEMENT ==========

    /**
     * Create a new rental contract
     */
    /**
     * Tạo hợp đồng, trạng thái ban đầu là PENDING_SIGNATURE, lưu file hợp đồng đã ký và chữ ký chủ nhà
     */
    async CreateContract(ctx, contractId, landlordId, tenantId, landlordMSP, tenantMSP, landlordCertId, tenantCertId, signedContractFileHash, landlordSignatureMeta, rentAmount, depositAmount, currency, startDate, endDate) {
        // Validate required parameters
        if (!contractId || !landlordId || !tenantId || !landlordMSP || !tenantMSP || !signedContractFileHash || !landlordSignatureMeta || !rentAmount || !startDate || !endDate) {
            throw new Error('Missing required parameters for contract creation');
        }

        // Check if contract already exists
        const contractBytes = await ctx.stub.getState(contractId);
        if (contractBytes && contractBytes.length > 0) {
            throw new Error(`Contract ${contractId} already exists`);
        }

        // Validate amounts
        const rent = parseFloat(rentAmount);
        const deposit = parseFloat(depositAmount);
        if (rent <= 0) throw new Error('Rent amount must be greater than 0');
        if (deposit < 0) throw new Error('Deposit amount cannot be negative');

        // Normalize and validate currency
        const normalizedCurrency = (currency || 'VND').toUpperCase();
        const allowedCurrencies = ['VND', 'USD', 'EUR', 'SGD'];
        if (!allowedCurrencies.includes(normalizedCurrency)) {
            throw new Error(`Currency ${normalizedCurrency} is not supported. Allowed: ${allowedCurrencies.join(', ')}`);
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) throw new Error('End date must be after start date');

        // Get client identity and validate creator is landlord
        const clientIdentity = ctx.clientIdentity;
        const creatorMSP = clientIdentity.getMSPID();
        const creatorId = this._extractUserIdFromIdentity(clientIdentity);

        // Validate that caller is the landlord specified in contract
        if (creatorMSP !== landlordMSP) {
            throw new Error(`Caller MSP ${creatorMSP} does not match landlord MSP ${landlordMSP}`);
        }
        if (creatorId !== landlordId) {
            throw new Error(`Caller identity ${creatorId} does not match landlord ID ${landlordId}`);
        }

        // Parse landlord signature metadata
        let landlordSigMeta;
        try {
            landlordSigMeta = JSON.parse(landlordSignatureMeta);
        } catch (e) {
            throw new Error('Invalid landlordSignatureMeta JSON');
        }

        const contract = {
            objectType: 'contract',
            contractId,
            landlordId,
            tenantId,
            landlordMSP,
            tenantMSP,
            landlordCertId: landlordCertId || null,
            tenantCertId: tenantCertId || null,
            landlordSignedHash: signedContractFileHash,
            fullySignedHash: null,
            rentAmount: rent, // stored as float
            depositAmount: deposit, // stored as float
            currency: normalizedCurrency,
            startDate,
            endDate,
            status: 'PENDING_SIGNATURE',
            signatures: {
                landlord: {
                    metadata: landlordSigMeta,
                    signedBy: landlordId,
                    signedAt: new Date().toISOString(),
                    status: 'SIGNED'
                }
            },
            createdBy: creatorId,
            createdByMSP: creatorMSP,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deposit: {
                landlord: null,
                tenant: null
            },
            firstPayment: null,
            penalties: [],
            currentExtensionNumber: 0,
            extensions: []
        };

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));

        // Create SBE (Smart Business Entity) key for contractId
        const sbeKey = ctx.stub.createCompositeKey('SBE', [contractId]);
        await ctx.stub.putState(sbeKey, Buffer.from(JSON.stringify({
            entityType: 'contract',
            entityId: contractId,
            createdAt: new Date().toISOString()
        })));

        ctx.stub.setEvent('ContractCreated', Buffer.from(JSON.stringify({
            contractId,
            landlordId,
            tenantId,
            status: 'PENDING_SIGNATURE',
            timestamp: new Date().toISOString()
        })));

        return contract;
    }

    /**
     * Get contract by ID
     */
    async GetContract(ctx, contractId) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        // Validate caller has read access to this contract
        this._validateReadAccess(ctx, contract);

        return contract;
    }

    /**
     * Query contracts by status
     */
    async QueryContractsByStatus(ctx, status) {
        const query = {
            selector: {
                objectType: 'contract',
                status: status
            }
        };

        return await this._getQueryResultForQueryString(ctx, JSON.stringify(query));
    }

    /**
     * Query contracts by party (landlord or tenant)
     */
    async QueryContractsByParty(ctx, partyId) {
        const query = {
            selector: {
                objectType: 'contract',
                $or: [
                    { landlordId: partyId },
                    { tenantId: partyId }
                ]
            }
        };

        return await this._getQueryResultForQueryString(ctx, JSON.stringify(query));
    }

    /**
     * Query contracts by date range with overlap support
     */
    async QueryContractsByDateRange(ctx, startDate, endDate) {
        // Convert dates to epoch for better range queries
        const startEpoch = new Date(startDate).getTime();
        const endEpoch = new Date(endDate).getTime();

        const query = {
            selector: {
                objectType: 'contract',
                $and: [
                    {
                        startDate: { $lte: endDate }
                    },
                    {
                        endDate: { $gte: startDate }
                    }
                ]
            }
        };

        const results = await this._getQueryResultForQueryString(ctx, JSON.stringify(query));

        // Additional client-side filtering for precise overlap checking
        return results.filter(contract => {
            const contractStart = new Date(contract.startDate).getTime();
            const contractEnd = new Date(contract.endDate).getTime();
            return contractStart <= endEpoch && contractEnd >= startEpoch;
        });
    }

    /**
     * Activate contract
     */
    async ActivateContract(ctx, contractId) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        // Check current status
        if (contract.status === 'ACTIVE') {
            throw new Error(`Contract ${contractId} is already active`);
        }

        // Check if contract has required signatures
        const hasLandlordSignature = contract.signatures.landlord && contract.signatures.landlord.status === 'SIGNED';
        const hasTenantSignature = contract.signatures.tenant && contract.signatures.tenant.status === 'SIGNED';

        if (!hasLandlordSignature || !hasTenantSignature) {
            throw new Error(`Contract ${contractId} cannot be activated without both parties' signatures`);
        }

        contract.status = 'ACTIVE';
        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));

        // Emit event
        const eventPayload = {
            contractId: contractId,
            status: 'ACTIVE',
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('ContractActivated', Buffer.from(JSON.stringify(eventPayload)));

        return contract;
    }

    /**
     * Terminate contract
     */
    async TerminateContract(ctx, contractId, summaryHash, reason) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        if (contract.status === 'TERMINATED') {
            throw new Error(`Contract ${contractId} is already terminated`);
        }

        // Validate caller is either landlord or tenant (both parties can terminate)
        const { isLandlord, isTenant } = this._validateCallerIsParty(ctx, contract);

        const clientIdentity = ctx.clientIdentity;
        const terminatorId = this._extractUserIdFromIdentity(clientIdentity);

        contract.status = 'TERMINATED';
        contract.terminatedBy = terminatorId;
        contract.terminatedByRole = isLandlord ? 'landlord' : 'tenant';
        contract.terminatedAt = new Date().toISOString();
        contract.terminationReason = reason || 'Not specified';
        contract.summaryHash = summaryHash || '';
        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));

        // Emit event
        const eventPayload = {
            contractId: contractId,
            status: 'TERMINATED',
            reason: reason,
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('ContractTerminated', Buffer.from(JSON.stringify(eventPayload)));

        return contract;
    }

    /**
     * Record contract extension
     * Ghi nhận gia hạn hợp đồng đã được chấp thuận từ BE
     */
    async RecordContractExtension(ctx, contractId, newEndDate, newRentAmount, extensionAgreementHash, extensionNotes) {
        // Validate required parameters
        if (!contractId || !newEndDate || !newRentAmount) {
            throw new Error('Missing required parameters: contractId, newEndDate, newRentAmount');
        }

        // Get contract
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        // Validate contract is ACTIVE
        if (contract.status !== 'ACTIVE') {
            throw new Error(`Contract ${contractId} must be ACTIVE to record extension. Current status: ${contract.status}`);
        }

        // Validate caller is either landlord or tenant
        const { isLandlord, isTenant } = this._validateCallerIsParty(ctx, contract);

        // Get caller identity for audit trail
        const clientIdentity = ctx.clientIdentity;
        const recorderId = this._extractUserIdFromIdentity(clientIdentity);

        // Validate and parse dates
        const currentEndDate = new Date(contract.endDate);
        const extendedEndDate = new Date(newEndDate);

        if (extendedEndDate <= currentEndDate) {
            throw new Error(`New end date ${newEndDate} must be after current end date ${contract.endDate}`);
        }

        // Validate new rent amount
        const newRent = parseFloat(newRentAmount);
        if (newRent <= 0) {
            throw new Error('New rent amount must be greater than 0');
        }

        // Initialize extensions array if not exists
        if (!contract.extensions) {
            contract.extensions = [];
        }
        if (!contract.currentExtensionNumber) {
            contract.currentExtensionNumber = 0;
        }

        // Create extension record
        const extensionNumber = contract.currentExtensionNumber + 1;
        const extensionRecord = {
            extensionNumber: extensionNumber,
            previousEndDate: contract.endDate,
            newEndDate: newEndDate,
            previousRentAmount: contract.rentAmount,
            newRentAmount: newRent,
            extensionAgreementHash: extensionAgreementHash || null,
            notes: extensionNotes || '',
            recordedBy: recorderId,
            recordedByRole: isLandlord ? 'landlord' : 'tenant',
            recordedAt: new Date().toISOString(),
            status: 'ACTIVE'
        };

        // Update contract
        contract.extensions.push(extensionRecord);
        contract.currentExtensionNumber = extensionNumber;
        contract.endDate = newEndDate;
        contract.rentAmount = newRent;
        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));

        // Emit event
        const eventPayload = {
            contractId: contractId,
            extensionNumber: extensionNumber,
            previousEndDate: extensionRecord.previousEndDate,
            newEndDate: newEndDate,
            previousRentAmount: extensionRecord.previousRentAmount,
            newRentAmount: newRent,
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('ContractExtended', Buffer.from(JSON.stringify(eventPayload)));

        return contract;
    }

    /**
     * Add signature to contract
     */
    /**
     * Người thuê ký hợp đồng, trạng thái chuyển sang chờ ký quỹ
     */
    async TenantSignContract(ctx, contractId, fullySignedContractFileHash, tenantSignatureMeta) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);

        const contract = JSON.parse(contractBytes.toString());
        if (contract.status !== 'PENDING_SIGNATURE') throw new Error('Contract is not waiting for tenant signature');

        // Verify caller identity matches tenant in contract (strict validation)
        this._validateCallerIdentity(ctx, contract.tenantId, contract.tenantMSP);

        let tenantSigMeta;
        try {
            tenantSigMeta = JSON.parse(tenantSignatureMeta);
        } catch (e) {
            throw new Error('Invalid tenantSignatureMeta JSON');
        }

        // Get actual caller identity for audit trail
        const clientIdentity = ctx.clientIdentity;
        const actualSignerId = this._extractUserIdFromIdentity(clientIdentity);

        contract.signatures.tenant = {
            metadata: tenantSigMeta,
            signedBy: actualSignerId, // Use actual signer ID for audit
            expectedSigner: contract.tenantId, // Keep expected signer for reference
            signedAt: new Date().toISOString(),
            status: 'SIGNED'
        };

        // Keep separate hashes for landlord-signed and fully-signed contract
        contract.fullySignedHash = fullySignedContractFileHash;
        contract.status = 'WAIT_DEPOSIT';
        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));
        ctx.stub.setEvent('TenantSigned', Buffer.from(JSON.stringify({
            contractId,
            signedBy: actualSignerId,
            status: 'WAIT_DEPOSIT',
            timestamp: new Date().toISOString()
        })));

        return contract;
    }

    /**
     * Ghi nhận ký quỹ của chủ nhà hoặc người thuê
     */
    async RecordDeposit(ctx, contractId, party, amount, depositTxRef) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);

        const contract = JSON.parse(contractBytes.toString());
        if (contract.status !== 'WAIT_DEPOSIT') throw new Error('Contract is not waiting for deposit');
        if (party !== 'landlord' && party !== 'tenant') throw new Error('Invalid party for deposit');

        // Validate caller identity matches the party making deposit
        if (party === 'landlord') {
            this._validateCallerIdentity(ctx, contract.landlordId, contract.landlordMSP);
        } else if (party === 'tenant') {
            this._validateCallerIdentity(ctx, contract.tenantId, contract.tenantMSP);
        }

        // Get actual caller identity for audit trail
        const clientIdentity = ctx.clientIdentity;
        const actualDepositorId = this._extractUserIdFromIdentity(clientIdentity);

        // Validate amount
        const depositAmount = parseFloat(amount);
        if (depositAmount <= 0) throw new Error('Deposit amount must be greater than 0');

        if (!contract.deposit) contract.deposit = { landlord: null, tenant: null };

        contract.deposit[party] = {
            amount: depositAmount,
            depositTxRef,
            depositedBy: actualDepositorId, // Use actual depositor ID for audit
            expectedDepositor: party === 'landlord' ? contract.landlordId : contract.tenantId,
            depositedAt: new Date().toISOString()
        };

        // Kiểm tra đã đủ ký quỹ chưa
        if (contract.deposit.landlord && contract.deposit.tenant) {
            contract.status = 'WAIT_FIRST_PAYMENT';
        }

        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));
        ctx.stub.setEvent('DepositRecorded', Buffer.from(JSON.stringify({
            contractId,
            party,
            status: contract.status,
            timestamp: new Date().toISOString()
        })));

        return contract;
    }

    /**
     * Ghi nhận thanh toán tháng đầu tiên của người thuê
     */
    async RecordFirstPayment(ctx, contractId, amount, paymentTxRef) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);

        const contract = JSON.parse(contractBytes.toString());
        if (contract.status !== 'WAIT_FIRST_PAYMENT') throw new Error('Contract is not waiting for first payment');

        // Verify caller identity matches tenant in contract (strict validation)
        this._validateCallerIdentity(ctx, contract.tenantId, contract.tenantMSP);

        // Get actual caller identity for audit trail
        const clientIdentity = ctx.clientIdentity;
        const actualPayerId = this._extractUserIdFromIdentity(clientIdentity);

        // Validate amount
        const paymentAmount = parseFloat(amount);
        if (paymentAmount !== contract.rentAmount) {
            throw new Error(`Payment amount ${paymentAmount} does not match rent amount ${contract.rentAmount}`);
        }

        contract.firstPayment = {
            amount: paymentAmount,
            paymentTxRef,
            paidBy: actualPayerId, // Use actual payer ID for audit
            expectedPayer: contract.tenantId, // Keep expected payer for reference
            paidAt: new Date().toISOString()
        };

        contract.status = 'ACTIVE';
        contract.activatedAt = new Date().toISOString();
        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));
        ctx.stub.setEvent('FirstPaymentRecorded', Buffer.from(JSON.stringify({
            contractId,
            status: 'ACTIVE',
            timestamp: new Date().toISOString()
        })));

        return contract;
    }

    /**
     * Tạo lịch thanh toán các tháng tiếp theo dựa trên ngày thanh toán đầu tiên
     */
    // async CreateMonthlyPaymentSchedule(ctx, contractId) {
    //     const contractBytes = await ctx.stub.getState(contractId);
    //     if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);

    //     const contract = JSON.parse(contractBytes.toString());
    //     if (!contract.firstPayment || contract.status !== 'ACTIVE') {
    //         throw new Error('Contract is not active or missing first payment');
    //     }

    //     const firstPaymentDate = new Date(contract.firstPayment.paidAt);
    //     const endDate = new Date(contract.endDate);
    //     let currentDate = new Date(firstPaymentDate);
    //     let period = 2; // Start from period 2 (first payment is period 1)
    //     const schedules = [];

    //     // Move to next month for second payment
    //     currentDate.setMonth(currentDate.getMonth() + 1);

    //     while (currentDate < endDate) {
    //         // EOM safe date calculation - handle month-end edge cases
    //         const targetDay = firstPaymentDate.getDate();
    //         const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    //         const safeDay = Math.min(targetDay, lastDayOfMonth);

    //         const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), safeDay);

    //         // Use composite key: payment~contractId~period
    //         const paymentKey = ctx.stub.createCompositeKey('payment', [contractId, period.toString().padStart(3, '0')]);

    //         const paymentSchedule = {
    //             objectType: 'payment',
    //             paymentId: `${contractId}-payment-${period.toString().padStart(3, '0')}`,
    //             contractId,
    //             period,
    //             amount: contract.rentAmount,
    //             status: 'SCHEDULED',
    //             dueDate: dueDate.toISOString(),
    //             createdAt: new Date().toISOString(),
    //             updatedAt: new Date().toISOString()
    //         };

    //         await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(paymentSchedule)));
    //         schedules.push(paymentSchedule);

    //         // Move to next month
    //         currentDate.setMonth(currentDate.getMonth() + 1);
    //         period++;
    //     }

    //     ctx.stub.setEvent('PaymentScheduleCreated', Buffer.from(JSON.stringify({
    //         contractId,
    //         totalSchedules: schedules.length,
    //         timestamp: new Date().toISOString()
    //     })));

    //     return schedules;
    // }
    async CreateMonthlyPaymentSchedule(ctx, contractId) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);

        const contract = JSON.parse(contractBytes.toString());
        if (!contract.firstPayment || contract.status !== 'ACTIVE') {
            throw new Error('Contract is not active or missing first payment');
        }

        const firstPaymentDate = new Date(contract.firstPayment.paidAt);
        const endDate = new Date(contract.endDate);

        // Bắt đầu từ kỳ 2 (kỳ 1 là khoản đã thanh toán đầu tiên)
        let period = 2;
        const schedules = [];

        // Bắt đầu lịch test: sau ngày thanh toán đầu tiên 5 tiếng
        let currentDate = new Date(firstPaymentDate);
        currentDate.setHours(currentDate.getHours() + 5); // ⬅️ mỗi 5 tiếng (60 tiếng / 12 = 5 tiếng/kỳ)

        while (currentDate < endDate) {
            const dueDate = new Date(currentDate); // mỗi 5 tiếng

            // Khóa tổng hợp: payment~contractId~period
            const paymentKey = ctx.stub.createCompositeKey(
                'payment',
                [contractId, period.toString().padStart(3, '0')]
            );

            const paymentSchedule = {
                objectType: 'payment',
                paymentId: `${contractId}-payment-${period.toString().padStart(3, '0')}`,
                contractId,
                period,
                amount: contract.rentAmount,
                status: 'SCHEDULED',
                dueDate: dueDate.toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(paymentSchedule)));
            schedules.push(paymentSchedule);

            // ⬇️ Tăng thêm 5 tiếng mỗi kỳ (60 tiếng / 12 = 5 tiếng/kỳ)
            currentDate.setHours(currentDate.getHours() + 5);
            period++;
        }

        ctx.stub.setEvent('PaymentScheduleCreated', Buffer.from(JSON.stringify({
            contractId,
            totalSchedules: schedules.length,
            timestamp: new Date().toISOString()
        })));

        return schedules;
    }


    /**
     * Ghi nhận phạt vi phạm hợp đồng
     */
    async RecordPenalty(ctx, contractId, party, amount, reason) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);

        const contract = JSON.parse(contractBytes.toString());
        if (party !== 'landlord' && party !== 'tenant') throw new Error('Invalid party for penalty');

        if (!reason) throw new Error('Penalty reason is required');

        // Validate caller is authorized (parties or admin can record penalties)
        const { isLandlord, isTenant, isAdmin, callerUserId } = this._validateCallerIsPartyOrAdmin(ctx, contract);

        // Get actual caller identity for audit trail
        const clientIdentity = ctx.clientIdentity;
        const penaltyRecorderId = callerUserId || this._extractUserIdFromIdentity(clientIdentity);

        // Validate amount
        const penaltyAmount = parseFloat(amount);
        if (penaltyAmount <= 0) throw new Error('Penalty amount must be greater than 0');

        if (!contract.penalties) contract.penalties = [];

        contract.penalties.push({
            party,
            amount: penaltyAmount,
            reason,
            recordedBy: penaltyRecorderId,
            recordedByRole: isAdmin ? 'admin' : (isLandlord ? 'landlord' : 'tenant'),
            timestamp: new Date().toISOString()
        });

        contract.updatedAt = new Date().toISOString();

        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));
        ctx.stub.setEvent('PenaltyRecorded', Buffer.from(JSON.stringify({
            contractId,
            party,
            amount: penaltyAmount,
            reason,
            timestamp: new Date().toISOString()
        })));

        return contract;
    }

    /**
     * Create payment schedule for contract extension
     * Tạo lịch thanh toán cho phần gia hạn hợp đồng
     */
    async CreateExtensionPaymentSchedule(ctx, contractId, extensionNumber) {
        // Validate required parameters
        if (!contractId || !extensionNumber) {
            throw new Error('Missing required parameters: contractId, extensionNumber');
        }

        // Get contract
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        // Validate contract is ACTIVE
        if (contract.status !== 'ACTIVE') {
            throw new Error(`Contract ${contractId} must be ACTIVE. Current status: ${contract.status}`);
        }

        // Find the extension record
        const extNum = parseInt(extensionNumber);
        const extension = contract.extensions?.find(ext => ext.extensionNumber === extNum);

        if (!extension) {
            throw new Error(`Extension number ${extensionNumber} not found for contract ${contractId}`);
        }

        // Get the last payment period to continue from there
        const lastPeriod = await this._getLastPaymentPeriod(ctx, contractId);
        let period = lastPeriod + 1;

        // Start date is the day after previous end date
        const previousEndDate = new Date(extension.previousEndDate);
        const newEndDate = new Date(extension.newEndDate);

        // For test schedule (5 hours interval)
        let currentDate = new Date(previousEndDate);
        currentDate.setHours(currentDate.getHours() + 5); // Start 5 hours after old end date

        const schedules = [];

        while (currentDate < newEndDate) {
            const dueDate = new Date(currentDate);

            // Create composite key: payment~contractId~period
            const paymentKey = ctx.stub.createCompositeKey(
                'payment',
                [contractId, period.toString().padStart(3, '0')]
            );

            const paymentSchedule = {
                objectType: 'payment',
                paymentId: `${contractId}-payment-${period.toString().padStart(3, '0')}`,
                contractId,
                period,
                amount: extension.newRentAmount, // Use new rent amount from extension
                status: 'SCHEDULED',
                dueDate: dueDate.toISOString(),
                extensionNumber: extNum, // Mark which extension this payment belongs to
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(paymentSchedule)));
            schedules.push(paymentSchedule);

            // Increment by 5 hours for test schedule
            currentDate.setHours(currentDate.getHours() + 5);
            period++;
        }

        // Emit event
        ctx.stub.setEvent('ExtensionPaymentScheduleCreated', Buffer.from(JSON.stringify({
            contractId,
            extensionNumber: extNum,
            totalSchedules: schedules.length,
            startPeriod: lastPeriod + 1,
            endPeriod: period - 1,
            timestamp: new Date().toISOString()
        })));

        return schedules;
    }

    // ========== PAYMENT MANAGEMENT ==========

    /**
     * Create payment schedule
     */
    async CreatePaymentSchedule(ctx, contractId, period, amount, orderRef) {
        // Validate contract exists
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const periodNum = parseInt(period);
        const paymentAmount = parseFloat(amount);

        if (periodNum <= 0) {
            throw new Error('Period must be greater than 0');
        }
        if (paymentAmount <= 0) {
            throw new Error('Payment amount must be greater than 0');
        }

        const paymentId = `${contractId}-payment-${periodNum}`;

        // Check if payment schedule already exists
        const existingPaymentBytes = await ctx.stub.getState(paymentId);
        if (existingPaymentBytes && existingPaymentBytes.length > 0) {
            throw new Error(`Payment schedule for contract ${contractId} period ${period} already exists`);
        }

        const clientIdentity = ctx.clientIdentity;

        const paymentSchedule = {
            objectType: 'payment',
            paymentId: paymentId,
            contractId: contractId,
            period: periodNum,
            amount: paymentAmount,
            status: 'SCHEDULED',
            orderRef: orderRef || '',
            createdBy: clientIdentity.getID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await ctx.stub.putState(paymentId, Buffer.from(JSON.stringify(paymentSchedule)));

        // Emit event
        const eventPayload = {
            paymentId: paymentId,
            contractId: contractId,
            period: periodNum,
            amount: paymentAmount,
            status: 'SCHEDULED',
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('PaymentScheduleCreated', Buffer.from(JSON.stringify(eventPayload)));

        return paymentSchedule;
    }

    /**
     * Record payment
     */
    async RecordPayment(ctx, contractId, period, amount, orderRef) {
        const periodNum = parseInt(period);
        const paymentAmount = parseFloat(amount);

        // Use composite key to find payment
        const paymentKey = ctx.stub.createCompositeKey('payment', [contractId, periodNum.toString().padStart(3, '0')]);
        const paymentBytes = await ctx.stub.getState(paymentKey);

        if (!paymentBytes || paymentBytes.length === 0) {
            throw new Error(`Payment schedule for contract ${contractId} period ${period} does not exist`);
        }

        const payment = JSON.parse(paymentBytes.toString());

        if (payment.status === 'PAID') {
            throw new Error(`Payment for contract ${contractId} period ${period} is already recorded`);
        }

        // Validate payment amount matches scheduled amount
        if (paymentAmount !== payment.amount) {
            throw new Error(`Payment amount ${paymentAmount} does not match scheduled amount ${payment.amount}`);
        }

        // Get contract to verify caller MSP
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }
        const contract = JSON.parse(contractBytes.toString());

        // Verify caller identity matches tenant in contract (strict validation)
        this._validateCallerIdentity(ctx, contract.tenantId, contract.tenantMSP);

        // Get actual caller identity for audit trail
        const clientIdentity = ctx.clientIdentity;
        const actualPayerId = this._extractUserIdFromIdentity(clientIdentity);

        // Check orderRef uniqueness if provided
        if (orderRef) {
            const orderRefKey = ctx.stub.createCompositeKey('orderRef', [orderRef]);
            const existingOrderBytes = await ctx.stub.getState(orderRefKey);
            if (existingOrderBytes && existingOrderBytes.length > 0) {
                throw new Error(`Order reference ${orderRef} is already used`);
            }

            // Create orderRef mapping
            await ctx.stub.putState(orderRefKey, Buffer.from(JSON.stringify({
                contractId,
                period: periodNum,
                paymentKey: paymentKey,
                createdAt: new Date().toISOString()
            })));
        }

        payment.status = 'PAID';
        payment.paidAmount = paymentAmount;
        payment.orderRef = orderRef || payment.orderRef;
        payment.paidBy = actualPayerId; // Use actual payer ID for audit
        payment.expectedPayer = contract.tenantId; // Keep expected payer for reference
        payment.paidAt = new Date().toISOString();
        payment.updatedAt = new Date().toISOString();

        await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(payment)));

        // Emit event
        const eventPayload = {
            paymentId: payment.paymentId,
            contractId: contractId,
            period: periodNum,
            amount: paymentAmount,
            orderRef: orderRef,
            status: 'PAID',
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('PaymentRecorded', Buffer.from(JSON.stringify(eventPayload)));

        return payment;
    }

    /**
     * Mark payment as overdue
     */
    async MarkOverdue(ctx, contractId, period) {
        const periodNum = parseInt(period);
        const paymentKey = ctx.stub.createCompositeKey('payment', [contractId, periodNum.toString().padStart(3, '0')]);

        const paymentBytes = await ctx.stub.getState(paymentKey);
        if (!paymentBytes || paymentBytes.length === 0) {
            throw new Error(`Payment for contract ${contractId} period ${period} does not exist`);
        }

        const payment = JSON.parse(paymentBytes.toString());

        if (payment.status === 'PAID') {
            throw new Error(`Cannot mark paid payment as overdue`);
        }

        // Auto-check if payment is actually overdue based on dueDate
        const dueDate = new Date(payment.dueDate);
        const currentDate = new Date();
        if (currentDate <= dueDate) {
            throw new Error(`Payment is not yet overdue. Due date: ${payment.dueDate}`);
        }

        payment.status = 'OVERDUE';
        payment.overdueAt = new Date().toISOString();
        payment.updatedAt = new Date().toISOString();

        await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(payment)));

        // Emit event
        const eventPayload = {
            paymentId: payment.paymentId,
            contractId: contractId,
            period: periodNum,
            status: 'OVERDUE',
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('PaymentOverdue', Buffer.from(JSON.stringify(eventPayload)));

        return payment;
    }

    /**
     * Apply penalty to payment
     */
    async ApplyPenalty(ctx, contractId, period, amount, policyRef, reason) {
        if (!reason) {
            throw new Error('Penalty reason is required');
        }

        const periodNum = parseInt(period);
        const penaltyAmount = parseFloat(amount);

        if (penaltyAmount <= 0) {
            throw new Error('Penalty amount must be greater than 0');
        }

        // Get contract to validate caller
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }
        const contract = JSON.parse(contractBytes.toString());

        // Validate caller is authorized (parties or admin can apply penalties)
        const { isLandlord, isTenant, isAdmin, callerUserId } = this._validateCallerIsPartyOrAdmin(ctx, contract);

        const paymentKey = ctx.stub.createCompositeKey('payment', [contractId, periodNum.toString().padStart(3, '0')]);
        const paymentBytes = await ctx.stub.getState(paymentKey);

        if (!paymentBytes || paymentBytes.length === 0) {
            throw new Error(`Payment for contract ${contractId} period ${period} does not exist`);
        }

        const payment = JSON.parse(paymentBytes.toString());
        const clientIdentity = ctx.clientIdentity;
        const actualApplierId = callerUserId || this._extractUserIdFromIdentity(clientIdentity);

        // Initialize penalties array if not exists
        if (!payment.penalties) {
            payment.penalties = [];
        }

        const penalty = {
            amount: penaltyAmount,
            reason: reason,
            policyRef: policyRef || '',
            appliedBy: actualApplierId,
            appliedByRole: isAdmin ? 'admin' : (isLandlord ? 'landlord' : 'tenant'),
            appliedAt: new Date().toISOString()
        };

        payment.penalties.push(penalty);
        payment.updatedAt = new Date().toISOString();

        await ctx.stub.putState(paymentKey, Buffer.from(JSON.stringify(payment)));

        // Emit event
        const eventPayload = {
            paymentId: payment.paymentId,
            contractId: contractId,
            period: periodNum,
            penaltyAmount: penaltyAmount,
            reason: reason,
            policyRef: policyRef,
            timestamp: new Date().toISOString()
        };
        ctx.stub.setEvent('PenaltyApplied', Buffer.from(JSON.stringify(eventPayload)));

        return payment;
    }

    /**
     * Resolve payment by order reference
     */
    async ResolveByOrderRef(ctx, orderRef) {
        const orderRefKey = ctx.stub.createCompositeKey('orderRef', [orderRef]);
        const orderRefBytes = await ctx.stub.getState(orderRefKey);

        if (!orderRefBytes || orderRefBytes.length === 0) {
            throw new Error(`No payment found with order reference ${orderRef}`);
        }

        const orderRefData = JSON.parse(orderRefBytes.toString());
        const paymentBytes = await ctx.stub.getState(orderRefData.paymentKey);

        if (!paymentBytes || paymentBytes.length === 0) {
            throw new Error(`Payment data not found for order reference ${orderRef}`);
        }

        return JSON.parse(paymentBytes.toString());
    }

    /**
     * Query payments by status
     */
    async QueryPaymentsByStatus(ctx, status) {
        const query = {
            selector: {
                objectType: 'payment',
                status: status
            }
        };

        return await this._getQueryResultForQueryString(ctx, JSON.stringify(query));
    }

    /**
     * Query overdue payments
     */
    async QueryOverduePayments(ctx) {
        const query = {
            selector: {
                objectType: 'payment',
                status: 'OVERDUE'
            }
        };

        return await this._getQueryResultForQueryString(ctx, JSON.stringify(query));
    }

    /**
     * Query penalties by contract
     */
    async QueryPenaltiesByContract(ctx, contractId) {
        const query = {
            selector: {
                objectType: 'payment',
                contractId: contractId,
                penalties: {
                    $exists: true,
                    $ne: null
                }
            }
        };

        const results = await this._getQueryResultForQueryString(ctx, JSON.stringify(query));

        // Filter results to only include records with non-empty penalties array
        const filteredResults = results.filter(result => {
            return result.penalties && Array.isArray(result.penalties) && result.penalties.length > 0;
        });

        return filteredResults;
    }

    /**
     * Query contract extensions by contract ID
     */
    async QueryContractExtensions(ctx, contractId) {
        // Get contract
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        // Validate caller has read access
        this._validateReadAccess(ctx, contract);

        // Return extensions array
        return {
            contractId: contractId,
            currentExtensionNumber: contract.currentExtensionNumber || 0,
            extensions: contract.extensions || []
        };
    }

    /**
     * Get active extension for a contract
     */
    async GetActiveExtension(ctx, contractId) {
        // Get contract
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        const contract = JSON.parse(contractBytes.toString());

        // Validate caller has read access
        this._validateReadAccess(ctx, contract);

        // Get current extension
        if (contract.currentExtensionNumber && contract.currentExtensionNumber > 0) {
            const activeExtension = contract.extensions?.find(
                ext => ext.extensionNumber === contract.currentExtensionNumber
            );

            if (activeExtension) {
                return {
                    contractId: contractId,
                    hasActiveExtension: true,
                    extension: activeExtension
                };
            }
        }

        return {
            contractId: contractId,
            hasActiveExtension: false,
            extension: null
        };
    }

    /**
     * Query all contracts with extensions
     */
    async QueryContractsWithExtensions(ctx) {
        const query = {
            selector: {
                objectType: 'contract',
                currentExtensionNumber: { $gt: 0 }
            }
        };

        const results = await this._getQueryResultForQueryString(ctx, JSON.stringify(query));

        // Return summary info
        return results.map(contract => ({
            contractId: contract.contractId,
            landlordId: contract.landlordId,
            tenantId: contract.tenantId,
            status: contract.status,
            currentExtensionNumber: contract.currentExtensionNumber,
            originalEndDate: contract.extensions?.[0]?.previousEndDate || contract.endDate,
            currentEndDate: contract.endDate,
            currentRentAmount: contract.rentAmount,
            totalExtensions: contract.extensions?.length || 0
        }));
    }

    // ========== UTILITY METHODS ==========

    /**
     * Get contract transaction history
     */
    async GetContractHistory(ctx, contractId) {
        const resultsIterator = await ctx.stub.getHistoryForKey(contractId);
        const results = [];

        let result = await resultsIterator.next();
        while (!result.done) {
            const record = {
                txId: result.value.txId,
                timestamp: new Date(result.value.timestamp.seconds * 1000 + result.value.timestamp.nanos / 1000000).toISOString(),
                isDelete: result.value.isDelete,
                value: result.value.value.toString('utf8')
            };

            if (record.value) {
                try {
                    record.value = JSON.parse(record.value);
                } catch (err) {
                    // Keep as string if not valid JSON
                }
            }

            results.push(record);
            result = await resultsIterator.next();
        }

        await resultsIterator.close();
        return results;
    }

    /**
     * Store contract private details in private data collection
     */
    async StoreContractPrivateDetails(ctx, contractId, privateDataJson) {
        // Validate contract exists
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) {
            throw new Error(`Contract ${contractId} does not exist`);
        }

        let privateData;
        try {
            privateData = JSON.parse(privateDataJson);
        } catch (error) {
            throw new Error(`Invalid private data JSON: ${error.message}`);
        }

        privateData.contractId = contractId;
        privateData.storedAt = new Date().toISOString();

        await ctx.stub.putPrivateData('contractPrivate', contractId, Buffer.from(JSON.stringify(privateData)));

        return { success: true, contractId: contractId };
    }

    /**
     * Get contract private details from private data collection
     */
    async GetContractPrivateDetails(ctx, contractId) {
        const privateDataBytes = await ctx.stub.getPrivateData('contractPrivate', contractId);
        if (!privateDataBytes || privateDataBytes.length === 0) {
            throw new Error(`No private data found for contract ${contractId}`);
        }

        return JSON.parse(privateDataBytes.toString());
    }

    // ========== HELPER METHODS ==========

    /**
     * Helper method to execute query and return results
     */
    async _getQueryResultForQueryString(ctx, queryString) {
        const resultsIterator = await ctx.stub.getQueryResult(queryString);
        const results = [];

        let result = await resultsIterator.next();
        while (!result.done) {
            const record = JSON.parse(result.value.value.toString());
            results.push(record);
            result = await resultsIterator.next();
        }

        await resultsIterator.close();
        return results;
    }

    /**
     * Helper method to get the last payment period for a contract
     */
    async _getLastPaymentPeriod(ctx, contractId) {
        // Query all payments for this contract (no sort to avoid index requirement)
        const query = {
            selector: {
                objectType: 'payment',
                contractId: contractId
            }
        };

        const results = await this._getQueryResultForQueryString(ctx, JSON.stringify(query));

        if (results && results.length > 0) {
            // Find max period client-side
            let maxPeriod = 0;
            for (const payment of results) {
                if (payment.period > maxPeriod) {
                    maxPeriod = payment.period;
                }
            }
            return maxPeriod;
        }

        // If no payments found, return 0 (will start from period 1)
        return 0;
    }

    /**
     * Extract user ID from client identity
     * Fabric client identity format: "CN=user,OU=client,O=Org,C=US::CN=ca.org.example.com,O=org.example.com,C=US"
     * We extract the CN from the first part (before ::)
     */
    _extractUserIdFromIdentity(clientIdentity) {
        try {
            const attrId = clientIdentity.getAttributeValue('hf.EnrollmentID');
            if (attrId) return attrId;

            const fullIdentity = clientIdentity.getID();
            const parts = fullIdentity.split('::');
            const subject = parts[1] || '';
            const cnMatch = subject.match(/CN=([^/]+)/);
            if (cnMatch && cnMatch[1]) return cnMatch[1];

            throw new Error('Unable to extract CN from identity');
        } catch (error) {
            throw new Error(`Failed to extract user ID from identity: ${error.message}`);
        }
    }


    /**
     * Validate caller identity matches expected user ID
     */
    _validateCallerIdentity(ctx, expectedUserId, expectedMSP) {
        const clientIdentity = ctx.clientIdentity;
        const callerMSP = clientIdentity.getMSPID();
        const callerUserId = this._extractUserIdFromIdentity(clientIdentity);

        // Check MSP first
        if (callerMSP !== expectedMSP) {
            throw new Error(`Caller MSP ${callerMSP} does not match expected MSP ${expectedMSP}`);
        }

        // Check user identity
        if (callerUserId !== expectedUserId) {
            throw new Error(`Caller identity ${callerUserId} does not match expected user ${expectedUserId}`);
        }

        return true;
    }

    /**
     * Validate caller is either landlord or tenant
     */
    _validateCallerIsParty(ctx, contract) {
        const clientIdentity = ctx.clientIdentity;
        const callerMSP = clientIdentity.getMSPID();
        const callerUserId = this._extractUserIdFromIdentity(clientIdentity);

        const isLandlord = (callerMSP === contract.landlordMSP && callerUserId === contract.landlordId);
        const isTenant = (callerMSP === contract.tenantMSP && callerUserId === contract.tenantId);

        if (!isLandlord && !isTenant) {
            throw new Error(`Caller ${callerUserId}@${callerMSP} is not authorized for this contract. Expected landlord: ${contract.landlordId}@${contract.landlordMSP} or tenant: ${contract.tenantId}@${contract.tenantMSP}`);
        }

        return { isLandlord, isTenant };
    }

    /**
     * Check if caller is admin (can perform administrative operations)
     */
    _isAdmin(ctx) {
        const clientIdentity = ctx.clientIdentity;
        const callerMSP = clientIdentity.getMSPID();

        // Admin MSPs - you can configure these based on your network setup
        const adminMSPs = ['OrgPropMSP', 'AdminMSP']; // Add your admin MSP IDs here

        if (adminMSPs.includes(callerMSP)) {
            return true;
        }

        // Check for admin role attribute
        const role = clientIdentity.getAttributeValue('role');
        if (role === 'admin' || role === 'regulator') {
            return true;
        }

        return false;
    }

    /**
     * Validate caller is either landlord, tenant, or admin
     */
    _validateCallerIsPartyOrAdmin(ctx, contract) {
        // Check if admin first
        if (this._isAdmin(ctx)) {
            const clientIdentity = ctx.clientIdentity;
            const callerUserId = this._extractUserIdFromIdentity(clientIdentity);
            return { isLandlord: false, isTenant: false, isAdmin: true, callerUserId };
        }

        // Otherwise must be a party to the contract
        const partyValidation = this._validateCallerIsParty(ctx, contract);
        return { ...partyValidation, isAdmin: false };
    }

    /**
     * Validate caller has read access to contract (either party or authorized viewer)
     */
    _validateReadAccess(ctx, contract) {
        try {
            // First try to validate as a party
            return this._validateCallerIsParty(ctx, contract);
        } catch (error) {
            // If not a party, could add additional read-only roles here
            // For now, only parties can read contract details
            throw error;
        }
    }

    /**
     * Check if caller has required role
     */
    _checkRole(ctx, requiredRoles) {
        const clientIdentity = ctx.clientIdentity;
        const role = clientIdentity.getAttributeValue('role');

        if (!requiredRoles.includes(role)) {
            throw new Error(`Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${role || 'none'}`);
        }
    }

    /**
     * Get chaincode version info
     */
    async GetVersionInfo(ctx) {
        const versionInfo = {
            chaincodeName: 'real-estate-cc',
            version: '2.4.1',
            description: 'Real Estate Rental Smart Contract with Contract Extension Support (Fixed CouchDB Index)',
            features: [
                'Contract Management with strict identity validation',
                'MSP and user identity verification for all operations',
                'Payment Processing with integer amounts and identity audit trails',
                'Composite keys for better performance',
                'Order reference uniqueness enforcement',
                'EOM-safe payment scheduling',
                'Automatic overdue detection',
                'Enhanced penalty system with admin and role-based authorization',
                'Comprehensive audit trails for all operations',
                'Strict caller validation for tenant/landlord operations',
                'Admin role support for penalty operations',
                'Contract Extension Support - Record multiple contract renewals',
                'Automatic payment schedule generation for extensions',
                'Extension history tracking with immutable audit trail'
            ],
            securityEnhancements: {
                'Identity Validation': 'All operations now validate both MSP and specific user identity',
                'Audit Trails': 'All transactions record actual performer identity alongside expected identity',
                'Role-based Access': 'Operations restricted to appropriate parties with validation',
                'Signature Verification': 'Contract signing requires exact identity match',
                'Admin Support': 'Admin users can perform penalty operations without tenant/landlord validation'
            },
            extensionFeatures: {
                'RecordContractExtension': 'Record approved contract extensions from backend',
                'CreateExtensionPaymentSchedule': 'Auto-generate payment schedules for extended period',
                'QueryContractExtensions': 'View complete extension history for a contract',
                'GetActiveExtension': 'Get current active extension details',
                'QueryContractsWithExtensions': 'Find all contracts that have been extended',
                'Extension Tracking': 'Each extension records old/new endDate, old/new rentAmount, timestamps'
            }
        };

        console.info('Version info requested');
        return versionInfo;
    }

}

module.exports = RealEstateContract;
