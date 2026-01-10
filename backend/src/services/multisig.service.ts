import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CLPublicKey, DeployUtil, RuntimeArgs, CLValueBuilder, CLAccountHash } from 'casper-js-sdk';
import { deployService } from './deploy.service';
import { casperService } from './casper.service';
import { config } from '../config';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not configured. Multi-sig deploy storage will not work.');
}

const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export interface RecoveryDeployRecord {
    id: string;
    recovery_id: string;
    target_account: string;
    new_public_key: string;
    deploy_type: string;
    deploy_json: any;           // Original unsigned deploy
    signed_deploys: any[];      // Array of signed versions
    threshold: number;
    status: 'pending' | 'ready' | 'sent' | 'confirmed' | 'failed';
    deploy_hash: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * MultisigService - Handles multi-signature deploy operations for recovery
 * 
 * This service manages the creation, storage, and signing of deploys that
 * require multiple guardian signatures before being sent to the network.
 */
export class MultisigService {
    /**
     * Build a recovery deploy that performs key management operations
     * This creates a deploy using the combined recovery_key_rotation contract that:
     * 1. Adds the new public key as an associated key with high weight
     * 2. Updates thresholds to give the new key control
     * 3. Removes the old (lost) associated key
     * 
     * All operations happen in a single deploy signed by guardians.
     */
    buildRecoveryDeploy(
        targetAccountHex: string,
        newPublicKeyHex: string,
        initiatorPublicKeyHex: string,
        oldPublicKeyHex?: string // The lost key to remove (optional, defaults to target account)
    ): { deployJson: any; deployHash: string } {
        // CRITICAL FIX: The deploy must be initiated by the TARGET account context
        // even if a guardian is building it. The guardians will sign it.
        // This ensures the session code runs on the target account to add keys to IT.
        const initiatorKey = CLPublicKey.fromHex(targetAccountHex);
        const newPublicKey = CLPublicKey.fromHex(newPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);

        // If old key not specified, use target account as the key to remove
        const oldPublicKey = oldPublicKeyHex
            ? CLPublicKey.fromHex(oldPublicKeyHex)
            : targetAccount;

        // Create account hashes for both keys
        const newKeyAccountHash = new CLAccountHash(newPublicKey.toAccountHash());
        const oldKeyAccountHash = new CLAccountHash(oldPublicKey.toAccountHash());

        // Build args for the combined recovery_key_rotation contract
        // Args: new_key, new_key_weight, old_key, deployment_threshold, key_management_threshold
        const args = RuntimeArgs.fromMap({
            new_key: CLValueBuilder.key(newKeyAccountHash),
            new_key_weight: CLValueBuilder.u8(3), // High weight to give full control
            old_key: CLValueBuilder.key(oldKeyAccountHash),
            deployment_threshold: CLValueBuilder.u8(1), // Allow new key to deploy
            key_management_threshold: CLValueBuilder.u8(1), // Allow new key to manage keys
        });

        // Build session WASM deploy
        const deployParams = new DeployUtil.DeployParams(
            initiatorKey,
            config.casper.chainName,
            1,
            config.deploy.ttl
        );

        // Use the combined recovery_key_rotation WASM
        const wasmBytes = deployService.loadWasm(config.wasm.recoveryKeyRotation);

        const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
            wasmBytes,
            args
        );

        const payment = DeployUtil.standardPayment(config.deploy.sessionPaymentAmount);

        const deploy = DeployUtil.makeDeploy(deployParams, session, payment);

        const deployJson = DeployUtil.deployToJson(deploy);

        return {
            deployJson,
            deployHash: deploy.hash.toString(),
        };
    }

    /**
     * Save an UNSIGNED deploy to Supabase
     * Called by the initiating guardian after creating (but not signing) the deploy
     * The deploy will be signed by guardians on the approve page
     */
    async saveUnsignedDeploy(
        recoveryId: string,
        targetAccount: string,
        newPublicKey: string,
        unsignedDeployJson: any,
        threshold: number
    ): Promise<{ success: boolean; error?: string }> {
        if (!supabase) {
            return { success: false, error: 'Supabase not configured' };
        }

        try {
            const { data, error } = await supabase
                .from('recovery_deploys')
                .insert({
                    recovery_id: recoveryId,
                    target_account: targetAccount,
                    new_public_key: newPublicKey,
                    deploy_type: 'key_rotation',
                    deploy_json: unsignedDeployJson,  // Store unsigned deploy here
                    signed_deploys: [],                // Empty array - guardians will add signed versions
                    threshold: threshold,
                    status: 'pending',
                })
                .select()
                .single();

            if (error) {
                console.error('Error saving unsigned deploy:', error);
                return { success: false, error: error.message };
            }

            console.log('Saved unsigned deploy for recovery:', recoveryId);
            return { success: true };
        } catch (error) {
            console.error('Error saving unsigned deploy:', error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * Add a signature to an existing deploy
     * Called by each guardian when they approve
     */
    async addSignedDeploy(
        recoveryId: string,
        signedDeployJson: any
    ): Promise<{
        success: boolean;
        signatureCount: number;
        thresholdMet: boolean;
        error?: string;
    }> {
        if (!supabase) {
            return { success: false, signatureCount: 0, thresholdMet: false, error: 'Supabase not configured' };
        }

        try {
            // Fetch current record
            const { data: current, error: fetchError } = await supabase
                .from('recovery_deploys')
                .select('*')
                .eq('recovery_id', recoveryId)
                .single();

            if (fetchError || !current) {
                return {
                    success: false,
                    signatureCount: 0,
                    thresholdMet: false,
                    error: 'Recovery deploy not found',
                };
            }

            // Add the new signed deploy to the array
            const signedDeploys = [...(current.signed_deploys || []), signedDeployJson];
            const signatureCount = signedDeploys.length;
            const thresholdMet = signatureCount >= current.threshold;

            // Update the record
            const { error: updateError } = await supabase
                .from('recovery_deploys')
                .update({
                    signed_deploys: signedDeploys,
                    status: thresholdMet ? 'ready' : 'pending',
                })
                .eq('recovery_id', recoveryId);

            if (updateError) {
                console.error('Error updating signed deploy:', updateError);
                return {
                    success: false,
                    signatureCount,
                    thresholdMet,
                    error: updateError.message,
                };
            }

            console.log(`Added signature to recovery ${recoveryId}. Count: ${signatureCount}/${current.threshold}`);
            return { success: true, signatureCount, thresholdMet };
        } catch (error) {
            console.error('Error adding signed deploy:', error);
            return { success: false, signatureCount: 0, thresholdMet: false, error: String(error) };
        }
    }

    /**
     * Get the deploy record for a recovery
     */
    async getDeployForRecovery(recoveryId: string): Promise<RecoveryDeployRecord | null> {
        if (!supabase) {
            console.error('Supabase not configured');
            return null;
        }

        try {
            const { data, error } = await supabase
                .from('recovery_deploys')
                .select('*')
                .eq('recovery_id', recoveryId)
                .single();

            if (error) {
                console.error('Error fetching deploy for recovery:', error);
                return null;
            }

            return data as RecoveryDeployRecord;
        } catch (error) {
            console.error('Error fetching deploy for recovery:', error);
            return null;
        }
    }

    /**
     * Get the deploy to sign for a recovery
     * Returns the latest signed deploy if available, otherwise the original unsigned deploy
     * This is the one guardians should sign next
     */
    async getDeployToSign(recoveryId: string): Promise<{
        deployJson: any;
        signatureCount: number;
        threshold: number;
        status: string;
        isUnsigned: boolean;  // True if returning the original unsigned deploy
    } | null> {
        const record = await this.getDeployForRecovery(recoveryId);
        if (!record) return null;

        const signedDeploys = record.signed_deploys || [];

        // If there are signed deploys, return the latest one
        // Otherwise return the original unsigned deploy_json
        let deployToSign: any;
        let isUnsigned = false;

        if (signedDeploys.length > 0) {
            deployToSign = signedDeploys[signedDeploys.length - 1];
        } else if (record.deploy_json) {
            deployToSign = record.deploy_json;
            isUnsigned = true;
        } else {
            return null;
        }

        return {
            deployJson: deployToSign,
            signatureCount: signedDeploys.length,
            threshold: record.threshold,
            status: record.status,
            isUnsigned,
        };
    }

    /**
     * Send the fully signed deploy to the network
     * Called when threshold is met
     */
    async sendDeploy(recoveryId: string): Promise<{
        success: boolean;
        deployHash?: string;
        error?: string;
    }> {
        if (!supabase) {
            return { success: false, error: 'Supabase not configured' };
        }

        try {
            // Get the record
            const record = await this.getDeployForRecovery(recoveryId);
            if (!record) {
                return { success: false, error: 'Recovery deploy not found' };
            }

            if (record.status !== 'ready') {
                // If already sent or confirmed, return the existing hash
                if ((record.status === 'sent' || record.status === 'confirmed') && record.deploy_hash) {
                    console.log(`Deploy already sent. Returning existing hash: ${record.deploy_hash}`);
                    return { success: true, deployHash: record.deploy_hash };
                }

                return {
                    success: false,
                    error: `Deploy is not ready. Status: ${record.status}, Signatures: ${record.signed_deploys.length}/${record.threshold}`,
                };
            }

            // Get the latest (fully signed) deploy
            const signedDeploys = record.signed_deploys || [];
            if (signedDeploys.length === 0) {
                return { success: false, error: 'No signed deploys found' };
            }

            // The user requested to ensure we send the LAST value in the array
            // This logic is correct: signedDeploys is an array of deploy objects, we want the last one
            let latestDeploy = signedDeploys[signedDeploys.length - 1];

            console.log(`\n=== Sending Multisig Deploy for Recovery ${recoveryId} ===`);
            console.log('Total signed versions:', signedDeploys.length);
            console.log('Selected deploy index:', signedDeploys.length - 1);
            console.log('Deploy type:', typeof latestDeploy);

            // Validate it's not an array (which would mean we stored an array instead of an object)
            if (Array.isArray(latestDeploy)) {
                console.warn('WARNING: Latest deploy is an array! This implies incorrect storage. Attempting to fix...');
                // If it's an array, it might be [deploy] or [deploy, signature] etc.
                // We'll assume the last item in THIS array is what we want, or the first?
                // Actually, if we stored [deploy], we just want the first item
                if (latestDeploy.length > 0) {
                    latestDeploy = latestDeploy[0];
                    console.log('Fixed: Extracted first item from array');
                }
            }

            // Handle stringified JSON if necessary
            if (typeof latestDeploy === 'string') {
                try {
                    latestDeploy = JSON.parse(latestDeploy);
                    console.log('Parsed stringified deploy JSON');
                } catch (e) {
                    console.error('Failed to parse deploy JSON string');
                }
            }

            console.log('Deploy keys:', Object.keys(latestDeploy));
            if (latestDeploy.deploy) {
                console.log('Has "deploy" property. Hash:', latestDeploy.deploy.hash);
            } else if (latestDeploy.hash) {
                console.log('Has "hash" property:', latestDeploy.hash);
            }

            // Submit to network
            const result = await casperService.submitDeployJson(latestDeploy);

            if (!result.success) {
                // Update status to failed
                await supabase
                    .from('recovery_deploys')
                    .update({ status: 'failed' })
                    .eq('recovery_id', recoveryId);

                return { success: false, error: result.message };
            }

            // Update record with deploy hash and status
            await supabase
                .from('recovery_deploys')
                .update({
                    status: 'sent',
                    deploy_hash: result.deployHash,
                })
                .eq('recovery_id', recoveryId);

            console.log(`Sent multi-sig deploy for recovery ${recoveryId}. Hash: ${result.deployHash}`);
            return { success: true, deployHash: result.deployHash };
        } catch (error) {
            console.error('Error sending deploy:', error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * Check if threshold is met for a recovery
     */
    async isThresholdMet(recoveryId: string): Promise<boolean> {
        const record = await this.getDeployForRecovery(recoveryId);
        if (!record) return false;

        return (record.signed_deploys?.length || 0) >= record.threshold;
    }

    /**
     * Update deploy status (e.g., after confirming on-chain)
     */
    async updateDeployStatus(
        recoveryId: string,
        status: 'confirmed' | 'failed'
    ): Promise<boolean> {
        if (!supabase) return false;

        try {
            const { error } = await supabase
                .from('recovery_deploys')
                .update({ status })
                .eq('recovery_id', recoveryId);

            return !error;
        } catch (error) {
            console.error('Error updating deploy status:', error);
            return false;
        }
    }
}

// Export singleton instance
export const multisigService = new MultisigService();
