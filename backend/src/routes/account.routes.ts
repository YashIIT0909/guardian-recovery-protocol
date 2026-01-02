import { Router, Request, Response } from 'express';
import { casperService } from '../services';
import { ApiResponse } from '../types';

const router = Router();

/**
 * GET /account/:publicKey
 * Get account info from the network
 */
router.get('/:publicKey', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        const accountInfo = await casperService.getAccountInfo(publicKey);

        res.json({
            success: true,
            data: accountInfo,
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get account info: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /account/:publicKey/keys
 * Get account's associated keys and thresholds
 */
router.get('/:publicKey/keys', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        const keys = await casperService.getAccountKeys(publicKey);

        res.json({
            success: true,
            data: keys,
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get account keys: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /account/deploy/:deployHash
 * Get deploy status
 */
router.get('/deploy/:deployHash', async (req: Request, res: Response) => {
    try {
        const { deployHash } = req.params;

        const status = await casperService.getDeployStatus(deployHash);

        res.json({
            success: true,
            data: status,
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get deploy status: ${error}`,
        } as ApiResponse);
    }
});

export default router;
