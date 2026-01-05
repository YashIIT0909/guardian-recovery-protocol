import {
    CasperClient,
    CLPublicKey,
    DeployUtil,
} from 'casper-js-sdk';
import { config } from '../config';

/**
 * CasperService - Handles connection to Casper node and basic operations
 */
export class CasperService {
    private client: CasperClient;

    constructor() {
        this.client = new CasperClient(config.casper.nodeUrl);
    }

    /**
     * Get the Casper client instance
     */
    getClient(): CasperClient {
        return this.client;
    }

    /**
     * Get the chain name from the node
     */
    async getChainName(): Promise<string> {
        try {
            const status = await this.client.nodeClient.getStatus();
            return status.chainspec_name;
        } catch (error) {
            console.error('Error getting chain name:', error);
            return config.casper.chainName; // Fallback
        }
    }

    /**
     * Check if account exists and has balance
     */
    async checkAccountBalance(publicKeyHex: string): Promise<{ exists: boolean; balance: string }> {
        try {
            // Get account info to find the main purse
            const accountInfo = await this.getAccountInfo(publicKeyHex);

            if (!accountInfo || !accountInfo.Account) {
                return { exists: false, balance: '0' };
            }

            const mainPurse = accountInfo.Account.main_purse;
            const stateRootHash = await this.client.nodeClient.getStateRootHash();

            const balance = await this.client.nodeClient.getAccountBalance(
                stateRootHash,
                mainPurse
            );

            return { exists: true, balance: balance.toString() };
        } catch (error: any) {
            console.error('Error checking account balance:', error);
            // If error contains "ValueNotFound", account doesn't exist
            if (error.toString().includes('ValueNotFound') || error.code === -32003) {
                return { exists: false, balance: '0' };
            }
            // For other errors, assume it might exist but failed to read
            return { exists: true, balance: '0' };
        }
    }

    /**
     * Get account info from the network
     */
    async getAccountInfo(publicKeyHex: string): Promise<any> {
        const publicKey = CLPublicKey.fromHex(publicKeyHex);
        const accountHash = publicKey.toAccountHashStr();

        const stateRootHash = await this.client.nodeClient.getStateRootHash();
        const accountInfo = await this.client.nodeClient.getBlockState(
            stateRootHash,
            accountHash,
            []
        );

        return accountInfo;
    }

    /**
     * Get account's associated keys and thresholds
     */
    async getAccountKeys(publicKeyHex: string): Promise<{
        associatedKeys: Array<{ accountHash: string; weight: number }>;
        actionThresholds: { deployment: number; keyManagement: number };
    }> {
        const accountInfo = await this.getAccountInfo(publicKeyHex);

        // Handle different response structures from Casper SDK
        const account = accountInfo?.Account || accountInfo?.stored_value?.Account || accountInfo;

        if (!account) {
            console.error('Account info structure:', JSON.stringify(accountInfo, null, 2));
            throw new Error('Could not parse account info');
        }

        // associatedKeys can be either snake_case or camelCase
        const associatedKeys = account.associatedKeys || account.associated_keys || [];
        const actionThresholds = account.actionThresholds || account.action_thresholds || {};

        return {
            associatedKeys: associatedKeys.map((key: any) => ({
                accountHash: key.accountHash || key.account_hash,
                weight: key.weight,
            })),
            actionThresholds: {
                deployment: actionThresholds.deployment || 1,
                keyManagement: actionThresholds.keyManagement || actionThresholds.key_management || 1,
            },
        };
    }

    /**
     * Query contract state
     */
    async queryContract(contractHash: string, key: string): Promise<any> {
        const stateRootHash = await this.client.nodeClient.getStateRootHash();

        try {
            const result = await this.client.nodeClient.getBlockState(
                stateRootHash,
                `hash-${contractHash}`,
                [key]
            );
            return result;
        } catch (error) {
            console.error(`Error querying contract: ${error}`);
            return null;
        }
    }

    /**
     * Query an account's named key value
     */
    async queryAccountNamedKey(publicKeyHex: string, keyName: string): Promise<any> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            const accountHash = publicKey.toAccountHashStr();
            const stateRootHash = await this.client.nodeClient.getStateRootHash();

            // Query the account state with the named key path
            const result = await this.client.nodeClient.getBlockState(
                stateRootHash,
                accountHash,
                [keyName]
            );
            return result;
        } catch (error) {
            console.error(`Error querying account named key ${keyName}: ${error}`);
            return null;
        }
    }

    /**
     * Check if account has guardians registered (checks associated keys)
     */
    async hasGuardians(publicKeyHex: string): Promise<boolean> {
        try {
            const accountInfo = await this.getAccountInfo(publicKeyHex);
            if (!accountInfo || !accountInfo.Account) return false;

            // Handle both snake_case and camelCase
            const associatedKeys = accountInfo.Account.associated_keys || accountInfo.Account.associatedKeys || [];
            // If there's more than 1 key, it implies guardians are added
            return associatedKeys.length > 1;
        } catch (error) {
            console.error(`Error checking has guardians: ${error}`);
            return false;
        }
    }

    /**
     * Get guardians for an account (returns associated keys)
     */
    async getGuardians(publicKeyHex: string): Promise<string[]> {
        try {
            const accountInfo = await this.getAccountInfo(publicKeyHex);
            if (!accountInfo || !accountInfo.Account) return [];

            // Handle both snake_case and camelCase
            const associatedKeys = accountInfo.Account.associated_keys || accountInfo.Account.associatedKeys || [];

            // Return all associated keys (including the primary one)
            // The frontend can filter if needed, or we can return all "guardians"
            return associatedKeys.map((k: any) => k.account_hash || k.accountHash);
        } catch (error) {
            console.error(`Error getting guardians: ${error}`);
            return [];
        }
    }

    /**
     * Get threshold for an account (returns key_management threshold)
     */
    async getThreshold(publicKeyHex: string): Promise<number> {
        try {
            const accountInfo = await this.getAccountInfo(publicKeyHex);
            if (!accountInfo || !accountInfo.Account) return 0;

            // Handle both snake_case and camelCase
            const actionThresholds = accountInfo.Account.action_thresholds || accountInfo.Account.actionThresholds;
            if (!actionThresholds) return 1; // Default threshold

            return actionThresholds.key_management || actionThresholds.keyManagement || 1;
        } catch (error) {
            console.error(`Error getting threshold: ${error}`);
            return 0;
        }
    }

    /**
     * Submit deploy to the network (using SDK)
     */
    async submitDeploy(signedDeploy: DeployUtil.Deploy): Promise<string> {
        const deployHash = await this.client.putDeploy(signedDeploy);
        return deployHash;
    }

    /**
     * Submit deploy JSON directly to node via RPC (bypasses SDK validation)
     * This is useful when the SDK's deployFromJson validation is too strict
     */
    async submitDeployJson(deployJson: any): Promise<{
        deployHash: string;
        success: boolean;
        message: string;
    }> {
        try {
            console.log('Submitting deploy to RPC:', config.casper.nodeUrl);
            console.log('Deploy JSON structure keys:', Object.keys(deployJson));

            // The deployJson should be {deploy: {...}} format
            // Casper RPC expects params: {deploy: {...}}
            // Make sure we're not double-wrapping
            let params = deployJson;
            if (deployJson.deploy && !deployJson.deploy.deploy) {
                // Already in correct format: {deploy: {...}}
                params = deployJson;
            } else if (!deployJson.deploy) {
                // Wrap if needed: deploy -> {deploy: deploy}
                params = { deploy: deployJson };
            }

            console.log('RPC params keys:', Object.keys(params));
            console.log('Deploy hash from body:', params.deploy?.hash);

            // Make direct RPC call to the node
            const response = await fetch(config.casper.nodeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'account_put_deploy',
                    params: params
                }),
            });

            console.log('RPC response status:', response.status, response.statusText);

            // Check if response is OK
            if (!response.ok) {
                const errorText = await response.text();
                console.error('RPC HTTP error:', errorText);
                return {
                    deployHash: '',
                    success: false,
                    message: `HTTP error ${response.status}: ${response.statusText}. ${errorText}`,
                };
            }

            // Get response text first to handle empty responses
            const responseText = await response.text();
            console.log('RPC response text length:', responseText.length);

            if (!responseText || responseText.trim() === '') {
                return {
                    deployHash: '',
                    success: false,
                    message: 'RPC returned empty response',
                };
            }

            // Parse the JSON response
            const result = JSON.parse(responseText) as {
                error?: { message?: string; code?: number; data?: any };
                result?: { deploy_hash?: string };
            };
            console.log('RPC response:', JSON.stringify(result, null, 2));

            if (result.error) {
                return {
                    deployHash: '',
                    success: false,
                    message: `RPC error: ${result.error.message || JSON.stringify(result.error)}`,
                };
            }

            const deployHash = result.result?.deploy_hash || '';
            return {
                deployHash,
                success: true,
                message: 'Deploy submitted successfully via RPC',
            };
        } catch (error) {
            console.error('Error submitting deploy via RPC:', error);
            return {
                deployHash: '',
                success: false,
                message: `Error submitting deploy: ${error}`,
            };
        }
    }

    /**
     * Wait for deploy execution using polling
     */
    async waitForDeploy(
        deployHash: string,
        timeout: number = 60000
    ): Promise<{ success: boolean; message: string }> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const [, deployResult] = await this.client.getDeploy(deployHash);

                if (deployResult.execution_results && deployResult.execution_results.length > 0) {
                    const executionResult = deployResult.execution_results[0];
                    if (executionResult.result.Success) {
                        return { success: true, message: 'Deploy executed successfully' };
                    } else {
                        return {
                            success: false,
                            message: executionResult.result.Failure?.error_message || 'Unknown error',
                        };
                    }
                }
            } catch {
                // Deploy not yet processed, continue waiting
            }

            // Wait 2 seconds before polling again
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        return { success: false, message: 'Timeout waiting for deploy' };
    }

    /**
     * Get deploy status
     */
    async getDeployStatus(deployHash: string): Promise<{
        deployHash: string;
        status: 'pending' | 'success' | 'failed';
        executionResult?: any;
    } | null> {
        try {
            const [deploy, deployResult] = await this.client.getDeploy(deployHash);

            let status: 'pending' | 'success' | 'failed' = 'pending';
            let executionResult = null;

            if (deployResult.execution_results && deployResult.execution_results.length > 0) {
                const result = deployResult.execution_results[0];
                executionResult = result;
                if (result.result.Success) {
                    status = 'success';
                } else {
                    status = 'failed';
                }
            }

            return {
                deployHash,
                status,
                executionResult
            };
        } catch (error) {
            console.error(`Error getting deploy status: ${error}`);
            return null;
        }
    }

    /**
     * Get active recovery ID for an account
     */
    async getActiveRecovery(publicKeyHex: string): Promise<string | null> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            // AccountHash Display format is "account-hash-{hex}"
            const accountHashStr = publicKey.toAccountHashStr();

            const keyName = `grp_active_${accountHashStr}`;
            const result = await this.queryAccountNamedKey(publicKeyHex, keyName);

            if (result && result.CLValue) {
                return String(result.CLValue.data);
            }
            return null;
        } catch (error) {
            console.error(`Error getting active recovery: ${error}`);
            return null;
        }
    }

    /**
     * Get recovery details by ID
     */
    async getRecoveryDetails(signerPublicKeyHex: string, recoveryId: string): Promise<{
        account: string;
        newKey: string;
        approvalCount: number;
        isApproved: boolean;
    } | null> {
        try {
            // Recovery data is stored in the signer's account named keys
            const accountKey = `grp_rec_${recoveryId}_account`;
            const newKeyKey = `grp_rec_${recoveryId}_new_key`;
            const approvalCountKey = `grp_rec_${recoveryId}_approval_count`;
            const approvedKey = `grp_rec_${recoveryId}_approved`;

            const [accountResult, newKeyResult, countResult, approvedResult] = await Promise.all([
                this.queryAccountNamedKey(signerPublicKeyHex, accountKey),
                this.queryAccountNamedKey(signerPublicKeyHex, newKeyKey),
                this.queryAccountNamedKey(signerPublicKeyHex, approvalCountKey),
                this.queryAccountNamedKey(signerPublicKeyHex, approvedKey),
            ]);

            if (!accountResult?.CLValue) {
                return null;
            }

            return {
                account: accountResult.CLValue.data ?
                    `account-hash-${Buffer.from(accountResult.CLValue.data).toString('hex')}` : '',
                newKey: newKeyResult?.CLValue?.data || '',
                approvalCount: Number(countResult?.CLValue?.data) || 0,
                isApproved: approvedResult?.CLValue?.data === true,
            };
        } catch (error) {
            console.error(`Error getting recovery details: ${error}`);
            return null;
        }
    }
}

// Export singleton instance
export const casperService = new CasperService();
