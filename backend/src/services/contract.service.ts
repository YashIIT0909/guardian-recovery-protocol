import {
    CLPublicKey,
    CLValueBuilder,
    RuntimeArgs,
    CLAccountHash,
    DeployUtil,
} from 'casper-js-sdk';
import { config } from '../config';
import { deployService } from './deploy.service';
import { DeployResult } from '../types';

export class ContractService {
    private contractHash: string;

    constructor() {
        if (!config.contract.recoveryRegistryHash) {
            throw new Error('RECOVERY_REGISTRY_HASH is not defined in environment variables');
        }
        this.contractHash = config.contract.recoveryRegistryHash;
    }

    /**
     * Helper: Build a contract call deploy
     */
    private buildContractDeploy(
        callerPublicKey: CLPublicKey,
        entryPoint: string,
        args: RuntimeArgs,
        paymentAmount: string = config.deploy.paymentAmount
    ): DeployUtil.Deploy {
        return deployService.buildContractCallDeploy(
            callerPublicKey,
            this.contractHash,
            entryPoint,
            args,
            paymentAmount
        );
    }

    // ============================================================================
    // Initialize Guardians
    // ============================================================================

    /**
     * Register account with guardians and threshold
     * Entry Point: init_guardians
     */
    async initializeGuardians(
        userPublicKeyHex: string,
        guardians: string[],
        threshold: number
    ): Promise<DeployResult> {
        const userPublicKey = CLPublicKey.fromHex(userPublicKeyHex);
        const userAccountHash = new CLAccountHash(userPublicKey.toAccountHash());

        const guardianAccountHashes = guardians.map((g) => {
            const pk = CLPublicKey.fromHex(g);
            return new CLAccountHash(pk.toAccountHash());
        });

        const args = RuntimeArgs.fromMap({
            action: CLValueBuilder.u8(1), // Action 1: Initialize Guardians
            account: CLValueBuilder.key(userAccountHash),
            guardians: CLValueBuilder.list(guardianAccountHashes),
            threshold: CLValueBuilder.u8(threshold),
        });

        // Use session WASM deploy instead of stored contract call
        // The recovery_registry.wasm is designed to be run as session code
        const deploy = deployService.buildSessionWasmDeploy(
            userPublicKey,
            config.wasm.recoveryRegistry,
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Initiate Recovery
    // ============================================================================

    /**
     * Entry Point: start_recovery
     */
    async initiateRecovery(
        initiatorPublicKeyHex: string,
        targetAccountHex: string,
        newPublicKeyHex: string
    ): Promise<DeployResult> {
        const initiatorKey = CLPublicKey.fromHex(initiatorPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const newPublicKey = CLPublicKey.fromHex(newPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.key(new CLAccountHash(targetAccount.toAccountHash())),
            new_key: newPublicKey,
        });

        const deploy = this.buildContractDeploy(
            initiatorKey,
            'start_recovery',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Approve Recovery
    // ============================================================================

    /**
     * Entry Point: approve
     */
    async approveRecovery(
        guardianPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const guardianKey = CLPublicKey.fromHex(guardianPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildContractDeploy(
            guardianKey,
            'approve',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Check Threshold Met
    // ============================================================================

    /**
     * Entry Point: is_approved
     */
    async buildCheckThresholdDeploy(
        signerPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildContractDeploy(
            signerKey,
            'is_approved',
            args,
            config.deploy.paymentAmount
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Finalize Recovery
    // ============================================================================

    /**
     * Entry Point: finalize
     */
    async finalizeRecovery(
        signerPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildContractDeploy(
            signerKey,
            'finalize',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // ACTION 8: Has Guardians
    // ============================================================================

    /**
     * Entry Point: has_guardians
     */
    async buildHasGuardiansDeploy(
        signerPublicKeyHex: string,
        targetAccountHex: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const targetAccountHash = new CLAccountHash(targetAccount.toAccountHash());

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.key(targetAccountHash),
        });

        const deploy = this.buildContractDeploy(
            signerKey,
            'has_guardians',
            args,
            config.deploy.paymentAmount
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    /**
     * Entry Point: get_guardians
     */
    async buildGetGuardiansDeploy(
        signerPublicKeyHex: string,
        targetAccountHex: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const targetAccountHash = new CLAccountHash(targetAccount.toAccountHash());

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.key(targetAccountHash),
        });

        const deploy = this.buildContractDeploy(
            signerKey,
            'get_guardians',
            args,
            config.deploy.paymentAmount
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }
}

export const contractService = new ContractService();
