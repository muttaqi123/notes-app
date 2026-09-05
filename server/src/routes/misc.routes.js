import { Router } from 'express';
import * as ctrl from '../controllers/misc.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/notifications', ctrl.listNotifications);
router.post('/notifications/read-all', ctrl.markAllRead);
router.post('/notifications/:id/read', ctrl.markRead);
router.delete('/notifications', ctrl.clearNotifications);

router.get('/export/json', ctrl.exportJson);
router.get('/export/markdown', ctrl.exportMarkdown);

export default router;
