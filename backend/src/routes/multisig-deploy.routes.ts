import { Router, Request, Response } from 'express';
import { multisigService } from '../services/multisig.service';
import { casperService } from '../services/casper.service';
import { ApiResponse } from '../types';

const router = Router();

/**
 * POST /multisig/build
 * Build a multi-sig recovery deploy for key management operations
 */
router.post('/build', async (req: Request, res: Response) => {
    try {
        const { targetAccount, newPublicKey, initiatorPublicKey } = req.body;

        if (!targetAccount || !newPublicKey || !initiatorPublicKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: targetAccount, newPublicKey, initiatorPublicKey',
            } as ApiResponse);
        }

        const result = multisigService.buildRecoveryDeploy(
            targetAccount,
            newPublicKey,
            initiatorPublicKey
        );

        res.json({
            success: true,
            data: {
                deployJson: result.deployJson,
                deployHash: result.deployHash,
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error building multi-sig deploy:', error);
        res.status(500).json({
            success: false,
            error: `Failed to build multi-sig deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /multisig/save
 * Save an UNSIGNED deploy to Supabase (called by initiator)
 * The backend verifies the recovery ID from the smart contract
 */
router.post('/save', async (req: Request, res: Response) => {
    try {
        const { recoveryId, targetAccount, newPublicKey, deployJson, threshold } = req.body;

        if (!targetAccount || !newPublicKey || !deployJson || !threshold) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: targetAccount, newPublicKey, deployJson, threshold',
            } as ApiResponse);
        }

        // Fetch the recovery ID from the smart contract to ensure consistency
        console.log('Fetching recovery ID from contract for target account:', targetAccount);
        const contractRecoveryId = await casperService.getActiveRecoveryIdFromContract(targetAccount);
        
        // Use contract recovery ID if available, otherwise fall back to provided ID
        let finalRecoveryId: string;
        if (contractRecoveryId) {
            finalRecoveryId = contractRecoveryId;
            console.log('Using contract recovery ID:', finalRecoveryId);
            
            // Log if there's a mismatch between provided and contract ID
            if (recoveryId && recoveryId !== contractRecoveryId) {
                console.warn(`Recovery ID mismatch: provided=${recoveryId}, contract=${contractRecoveryId}. Using contract value.`);
            }
        } else if (recoveryId) {
            // Fallback to provided ID if contract query fails
            console.warn('Could not fetch recovery ID from contract, using provided ID:', recoveryId);
            finalRecoveryId = recoveryId;
        } else {
            return res.status(400).json({
                success: false,
                error: 'No active recovery found in contract and no recoveryId provided',
            } as ApiResponse);
        }

        const result = await multisigService.saveUnsignedDeploy(
            finalRecoveryId,
            targetAccount,
            newPublicKey,
            deployJson,
            threshold
        );

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error,
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: { 
                message: 'Unsigned deploy saved successfully',
                recoveryId: finalRecoveryId,  // Return the actual recovery ID used
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error saving unsigned deploy:', error);
        res.status(500).json({
            success: false,
            error: `Failed to save unsigned deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /multisig/sign
 * Add a signature to an existing deploy
 */
router.post('/sign', async (req: Request, res: Response) => {
    try {
        const { recoveryId, signedDeployJson } = req.body;

        if (!recoveryId || !signedDeployJson) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: recoveryId, signedDeployJson',
            } as ApiResponse);
        }

        const result = await multisigService.addSignedDeploy(recoveryId, signedDeployJson);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error,
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: {
                signatureCount: result.signatureCount,
                thresholdMet: result.thresholdMet,
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error adding signature:', error);
        res.status(500).json({
            success: false,
            error: `Failed to add signature: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /multisig/:recoveryId
 * Get the deploy to sign for a recovery (returns latest signed or original unsigned)
 */
router.get('/:recoveryId', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;

        const result = await multisigService.getDeployToSign(recoveryId);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Recovery deploy not found',
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: result,
        } as ApiResponse);
    } catch (error) {
        console.error('Error fetching deploy:', error);
        res.status(500).json({
            success: false,
            error: `Failed to fetch deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /multisig/:recoveryId/full
 * Get the full deploy record for a recovery
 */
router.get('/:recoveryId/full', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;

        const record = await multisigService.getDeployForRecovery(recoveryId);

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'Recovery deploy not found',
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: record,
        } as ApiResponse);
    } catch (error) {
        console.error('Error fetching deploy record:', error);
        res.status(500).json({
            success: false,
            error: `Failed to fetch deploy record: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /multisig/send
 * Send the fully signed deploy to the network
 */
router.post('/send', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.body;

        if (!recoveryId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: recoveryId',
            } as ApiResponse);
        }

        // Check if threshold is met first
        const isReady = await multisigService.isThresholdMet(recoveryId);
        if (!isReady) {
            return res.status(400).json({
                success: false,
                error: 'Threshold not met. More signatures required.',
            } as ApiResponse);
        }

        const result = await multisigService.sendDeploy(recoveryId);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error,
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: {
                deployHash: result.deployHash,
                message: 'Multi-sig deploy sent to network',
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error sending deploy:', error);
        res.status(500).json({
            success: false,
            error: `Failed to send deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /multisig/status/:recoveryId
 * Get the status of a multi-sig deploy
 */
router.get('/status/:recoveryId', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;

        const record = await multisigService.getDeployForRecovery(recoveryId);

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'Recovery deploy not found',
            } as ApiResponse);
        }

        // If deploy was sent, check on-chain status
        let onChainStatus = null;
        if (record.deploy_hash && record.status === 'sent') {
            onChainStatus = await casperService.getDeployStatus(record.deploy_hash);

            // Update status if confirmed or failed
            if (onChainStatus?.status === 'success') {
                await multisigService.updateDeployStatus(recoveryId, 'confirmed');
                record.status = 'confirmed';
            } else if (onChainStatus?.status === 'failed') {
                await multisigService.updateDeployStatus(recoveryId, 'failed');
                record.status = 'failed';
            }
        }

        res.json({
            success: true,
            data: {
                recoveryId: record.recovery_id,
                status: record.status,
                signatureCount: record.signed_deploys?.length || 0,
                threshold: record.threshold,
                thresholdMet: (record.signed_deploys?.length || 0) >= record.threshold,
                deployHash: record.deploy_hash,
                onChainStatus: onChainStatus?.status,
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error getting deploy status:', error);
        res.status(500).json({
            success: false,
            error: `Failed to get deploy status: ${error}`,
        } as ApiResponse);
    }
});

export default router;
