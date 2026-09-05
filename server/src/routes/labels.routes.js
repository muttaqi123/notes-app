import { Router } from 'express';
import * as ctrl from '../controllers/labels.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { labelSchema, updateLabelSchema } from './schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', validate(labelSchema), ctrl.create);
router.patch('/:id', validate(updateLabelSchema), ctrl.update);
router.delete('/:id', ctrl.destroy);

export default router;
