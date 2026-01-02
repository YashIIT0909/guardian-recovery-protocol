import { CLPublicKey, DeployUtil } from 'casper-js-sdk';
import { deployService } from './deploy.service';
import { casperService } from './casper.service';
import { config } from '../config';
import { AddKeyParams, RemoveKeyParams, UpdateThresholdsParams, DeployResult } from '../types';

/**
 * SessionService - Handles session WASM execution for key operations
 *
 * IMPORTANT: These operations require multi-sig from guardians
 * The deploy must be signed by enough keys to meet the account's
 * key_management_threshold before submission
 */
export class SessionService {
    // ============================================================================
    // STEP 4: Add Associated Key (Guardians jointly execute)
    // ============================================================================

    /**
     * Build deploy for adding a new associated key
     * This is the REAL POWER - executes in account context
     *
     * @param signerPublicKeyHex - First guardian's public key
     * @param newKeyHex - New key to add
     * @param weight - Weight for the new key
     */
    buildAddKeyDeploy(
        signerPublicKeyHex: string,
        newKeyHex: string,
        weight: number = 1
    ): string {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const deploy = deployService.buildAddKeyDeploy(signerKey, newKeyHex, weight);
        return deployService.deployToJson(deploy);
    }

    // ============================================================================
    // STEP 5: Remove Associated Key (Guardians remove old key)
    // ============================================================================

    /**
     * Build deploy for removing an associated key
     *
     * @param signerPublicKeyHex - First guardian's public key
     * @param keyToRemoveHex - Key to remove
     */
    buildRemoveKeyDeploy(
        signerPublicKeyHex: string,
        keyToRemoveHex: string
    ): string {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const deploy = deployService.buildRemoveKeyDeploy(signerKey, keyToRemoveHex);
        return deployService.deployToJson(deploy);
    }

    // ============================================================================
    // STEP 6: Update Thresholds (Lock down after recovery)
    // ============================================================================

    /**
     * Build deploy for updating account thresholds
     *
     * @param signerPublicKeyHex - Signer's public key
     * @param deploymentThreshold - New deployment threshold
     * @param keyManagementThreshold - New key management threshold
     */
    buildUpdateThresholdsDeploy(
        signerPublicKeyHex: string,
        deploymentThreshold: number,
        keyManagementThreshold: number
    ): string {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const deploy = deployService.buildUpdateThresholdsDeploy(
            signerKey,
            deploymentThreshold,
            keyManagementThreshold
        );
        return deployService.deployToJson(deploy);
    }

    // ============================================================================
    // Multi-Sig Deploy Handling
    // ============================================================================

    /**
     * Add signature to existing deploy
     * Each guardian calls this to add their signature
     */
    addSignatureToDeploy(deployJson: string, signatureHex: string): string {
        const deploy = deployService.jsonToDeploy(deployJson);
        // In practice, the frontend handles signing with the wallet
        // This is a placeholder for the signed deploy return
        return deployService.deployToJson(deploy);
    }

    /**
     * Submit multi-signed deploy
     * Called once all required signatures are collected
     */
    async submitSignedDeploy(deployJson: string): Promise<DeployResult> {
        try {
            const deploy = deployService.jsonToDeploy(deployJson);
            const result = await deployService.submit(deploy);
            return result;
        } catch (error) {
            return {
                deployHash: '',
                success: false,
                message: `Error submitting deploy: ${error}`,
            };
        }
    }

    /**
     * Get number of signatures on a deploy
     */
    getSignatureCount(deployJson: string): number {
        const deploy = deployService.jsonToDeploy(deployJson);
        return deploy.approvals.length;
    }

    /**
     * Check if deploy has enough signatures
     * Compares against required threshold for the target account
     */
    async hasEnoughSignatures(
        deployJson: string,
        targetAccountHex: string
    ): Promise<boolean> {
        const deploy = deployService.jsonToDeploy(deployJson);
        const signatureCount = deploy.approvals.length;

        // Get account's key management threshold
        const accountKeys = await casperService.getAccountKeys(targetAccountHex);
        const requiredWeight = accountKeys.actionThresholds.keyManagement;

        // Calculate total weight of signatures
        // This is simplified - in practice you'd sum the weights of signing keys
        return signatureCount >= requiredWeight;
    }
}

// Export singleton instance
export const sessionService = new SessionService();
