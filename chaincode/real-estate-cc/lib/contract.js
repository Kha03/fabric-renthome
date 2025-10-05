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
     * Tạo hợp đồng, trạng thái ban đầu là WAIT_TENANT_SIGNATURE, lưu file hợp đồng đã ký và chữ ký chủ nhà
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
        
        // Validate and convert amounts to integers (cents/đồng)
        const rent = Math.round(parseFloat(rentAmount) * 100);
        const deposit = Math.round(parseFloat(depositAmount) * 100);
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
        
        // Get client identity
        const clientIdentity = ctx.clientIdentity;
        const creatorMSP = clientIdentity.getMSPID();
        const creatorId = clientIdentity.getID();
        
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
            rentAmount: rent, // stored as integer (cents/đồng)
            depositAmount: deposit, // stored as integer (cents/đồng)
            currency: normalizedCurrency,
            startDate,
            endDate,
            status: 'WAIT_TENANT_SIGNATURE',
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
            penalties: []
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
            status: 'WAIT_TENANT_SIGNATURE', 
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
        return JSON.parse(contractBytes.toString());
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

        const clientIdentity = ctx.clientIdentity;
        
        contract.status = 'TERMINATED';
        contract.terminatedBy = clientIdentity.getID();
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
     * Add signature to contract
     */
    /**
     * Người thuê ký hợp đồng, trạng thái chuyển sang chờ ký quỹ
     */
    async TenantSignContract(ctx, contractId, fullySignedContractFileHash, tenantSignatureMeta) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);
        
        const contract = JSON.parse(contractBytes.toString());
        if (contract.status !== 'WAIT_TENANT_SIGNATURE') throw new Error('Contract is not waiting for tenant signature');
        
        // Verify caller belongs to tenantMSP
        const clientIdentity = ctx.clientIdentity;
        const callerMSP = clientIdentity.getMSPID();
        if (callerMSP !== contract.tenantMSP) {
            throw new Error(`Caller MSP ${callerMSP} does not match expected tenant MSP ${contract.tenantMSP}`);
        }
        
        let tenantSigMeta;
        try {
            tenantSigMeta = JSON.parse(tenantSignatureMeta);
        } catch (e) {
            throw new Error('Invalid tenantSignatureMeta JSON');
        }
        
        contract.signatures.tenant = {
            metadata: tenantSigMeta,
            signedBy: contract.tenantId,
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
        
        // Convert amount to integer and validate
        const depositAmountInt = Math.round(parseFloat(amount) * 100);
        if (depositAmountInt <= 0) throw new Error('Deposit amount must be greater than 0');
        
        if (!contract.deposit) contract.deposit = { landlord: null, tenant: null };
        
        contract.deposit[party] = {
            amount: depositAmountInt,
            depositTxRef,
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
        
        // Verify caller belongs to tenantMSP (only tenant can make payment)
        const clientIdentity = ctx.clientIdentity;
        const callerMSP = clientIdentity.getMSPID();
        if (callerMSP !== contract.tenantMSP) {
            throw new Error(`Caller MSP ${callerMSP} does not match expected tenant MSP ${contract.tenantMSP}`);
        }
        
        // Convert amount to integer and validate
        const paymentAmountInt = Math.round(parseFloat(amount) * 100);
        if (paymentAmountInt !== contract.rentAmount) {
            throw new Error(`Payment amount ${paymentAmountInt} does not match rent amount ${contract.rentAmount}`);
        }
        
        contract.firstPayment = {
            amount: paymentAmountInt,
            paymentTxRef,
            paidBy: contract.tenantId,
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
    async CreateMonthlyPaymentSchedule(ctx, contractId) {
        const contractBytes = await ctx.stub.getState(contractId);
        if (!contractBytes || contractBytes.length === 0) throw new Error(`Contract ${contractId} does not exist`);
        
        const contract = JSON.parse(contractBytes.toString());
        if (!contract.firstPayment || contract.status !== 'ACTIVE') {
            throw new Error('Contract is not active or missing first payment');
        }
        
        const firstPaymentDate = new Date(contract.firstPayment.paidAt);
        const endDate = new Date(contract.endDate);
        let currentDate = new Date(firstPaymentDate);
        let period = 2; // Start from period 2 (first payment is period 1)
        const schedules = [];
        
        // Move to next month for second payment
        currentDate.setMonth(currentDate.getMonth() + 1);
        
        while (currentDate < endDate) {
            // EOM safe date calculation - handle month-end edge cases
            const targetDay = firstPaymentDate.getDate();
            const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            const safeDay = Math.min(targetDay, lastDayOfMonth);
            
            const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), safeDay);
            
            // Use composite key: payment~contractId~period
            const paymentKey = ctx.stub.createCompositeKey('payment', [contractId, period.toString().padStart(3, '0')]);
            
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
            
            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
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
        
        // Convert amount to integer and validate
        const penaltyAmountInt = Math.round(parseFloat(amount) * 100);
        if (penaltyAmountInt <= 0) throw new Error('Penalty amount must be greater than 0');
        
        if (!contract.penalties) contract.penalties = [];
        
        contract.penalties.push({
            party,
            amount: penaltyAmountInt,
            reason,
            timestamp: new Date().toISOString()
        });
        
        contract.updatedAt = new Date().toISOString();
        
        await ctx.stub.putState(contractId, Buffer.from(JSON.stringify(contract)));
        ctx.stub.setEvent('PenaltyRecorded', Buffer.from(JSON.stringify({ 
            contractId, 
            party, 
            amount: penaltyAmountInt, 
            reason, 
            timestamp: new Date().toISOString() 
        })));
        
        return contract;
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
        const paymentAmount = Math.round(parseFloat(amount) * 100); // Convert to integer
        
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
        
        // Verify caller belongs to tenantMSP (only tenant can make payment)
        const clientIdentity = ctx.clientIdentity;
        const callerMSP = clientIdentity.getMSPID();
        if (callerMSP !== contract.tenantMSP) {
            throw new Error(`Caller MSP ${callerMSP} does not match expected tenant MSP ${contract.tenantMSP}`);
        }
        
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
        payment.paidBy = contract.tenantId;
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
        const penaltyAmount = Math.round(parseFloat(amount) * 100); // Convert to integer
        
        if (penaltyAmount <= 0) {
            throw new Error('Penalty amount must be greater than 0');
        }
        
        const paymentKey = ctx.stub.createCompositeKey('payment', [contractId, periodNum.toString().padStart(3, '0')]);
        const paymentBytes = await ctx.stub.getState(paymentKey);
        
        if (!paymentBytes || paymentBytes.length === 0) {
            throw new Error(`Payment for contract ${contractId} period ${period} does not exist`);
        }

        const payment = JSON.parse(paymentBytes.toString());
        const clientIdentity = ctx.clientIdentity;
        
        // Initialize penalties array if not exists
        if (!payment.penalties) {
            payment.penalties = [];
        }

        const penalty = {
            amount: penaltyAmount,
            reason: reason,
            policyRef: policyRef || '',
            appliedBy: clientIdentity.getID(),
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
            version: '2.0.0',
            description: 'Real Estate Rental Smart Contract with enhanced security and data integrity',
            features: [
                'Contract Management with MSP validation',
                'Payment Processing with integer amounts', 
                'Composite keys for better performance',
                'Order reference uniqueness enforcement',
                'EOM-safe payment scheduling',
                'Automatic overdue detection',
                'Enhanced penalty system'
            ]
        };
        
        console.info('Version info requested');
        return versionInfo;
    }

}

module.exports = RealEstateContract;
