import { Router, Request, Response } from 'express';
import { checkUserEmail, submitUserEmail } from '../services/user.service';

const router = Router();

/**
 * GET /api/user/:publicKey/email
 * Check if user has submitted their email
 */
router.get('/:publicKey/email', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        if (!publicKey) {
            return res.status(400).json({
                success: false,
                error: 'Public key is required'
            });
        }

        const result = await checkUserEmail(publicKey);

        res.json({
            success: true,
            data: {
                hasEmail: result.hasEmail,
                // Don't expose the full email, just first 3 chars + *** + domain
                email: result.email ? maskEmail(result.email) : null
            }
        });
    } catch (error) {
        console.error('Error checking user email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check email status'
        });
    }
});

/**
 * POST /api/user/email
 * Submit user email for notifications
 */
router.post('/email', async (req: Request, res: Response) => {
    try {
        const { publicKey, email } = req.body;

        if (!publicKey) {
            return res.status(400).json({
                success: false,
                error: 'Public key is required'
            });
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        const result = await submitUserEmail(publicKey, email);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.message
            });
        }

        res.json({
            success: true,
            data: {
                message: result.message
            }
        });
    } catch (error) {
        console.error('Error submitting user email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit email'
        });
    }
});

/**
 * Helper function to mask email for privacy
 * john@example.com -> joh***@example.com
 */
function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal = local.length > 3
        ? local.substring(0, 3) + '***'
        : local.substring(0, 1) + '***';

    return `${maskedLocal}@${domain}`;
}

export default router;
