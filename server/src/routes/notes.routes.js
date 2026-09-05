import { Router } from 'express';
import * as ctrl from '../controllers/notes.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createNoteSchema, updateNoteSchema } from './schemas.js';

const router = Router();

// Every notes route is private. Applied once here rather than repeated on
// each line, so a new route cannot be added unprotected by forgetting it.
router.use(requireAuth);

router.get('/stats', ctrl.stats);
router.delete('/trash', ctrl.emptyTrash);

router.get('/', ctrl.list);
router.post('/', validate(createNoteSchema), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', validate(updateNoteSchema), ctrl.update);
router.post('/:id/trash', ctrl.trash);
router.post('/:id/restore', ctrl.restore);
router.delete('/:id', ctrl.destroy);

router.get('/:id/versions', ctrl.versions);
router.post('/:id/versions/:version/restore', ctrl.restoreVersion);

export default router;
