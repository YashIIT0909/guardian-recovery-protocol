import { Router } from 'express';
import recoveryRoutes from './recovery.routes';
import sessionRoutes from './session.routes';
import accountRoutes from './account.routes';

const router = Router();

// Mount routes
router.use('/recovery', recoveryRoutes);
router.use('/session', sessionRoutes);
router.use('/account', accountRoutes);

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
