import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/notes.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createNoteSchema, updateNoteSchema, reorderSchema, shareSchema, roleSchema,
} from './schemas.js';
import { env } from '../config/env.js';

const router = Router();

// Every notes route is private. Applied once here rather than repeated on each
// line, so a new route cannot be added unprotected by forgetting it.
router.use(requireAuth);

/**
 * Uploads are held in memory rather than written straight to disk: the file is
 * decoded and re-encoded before anything is persisted, so an upload that turns
 * out not to be an image never becomes a file at all.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    // A first cheap gate. The real check is that sharp can decode it — a
    // declared MIME type is the uploader's claim, not a fact.
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error('Only images can be attached'));
    }
    return cb(null, true);
  },
});

// Fixed paths first: '/stats' would otherwise be read as a note id.
router.get('/stats', ctrl.stats);
router.delete('/trash', ctrl.emptyTrash);
router.patch('/reorder', validate(reorderSchema), ctrl.reorder);

router.get('/', ctrl.list);
router.post('/', validate(createNoteSchema), ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', validate(updateNoteSchema), ctrl.update);
router.post('/:id/trash', ctrl.trash);
router.post('/:id/restore', ctrl.restore);
router.delete('/:id', ctrl.destroy);

router.get('/:id/versions', ctrl.versions);
router.post('/:id/versions/:version/restore', ctrl.restoreVersion);
router.get('/:id/activity', ctrl.activity);

router.get('/:id/collaborators', ctrl.collaborators);
router.post('/:id/collaborators', validate(shareSchema), ctrl.share);
router.patch('/:id/collaborators/:userId', validate(roleSchema), ctrl.updateCollaborator);
router.delete('/:id/collaborators/:userId', ctrl.revokeShare);
router.post('/:id/leave', ctrl.leave);

router.post('/:id/attachments', upload.single('image'), ctrl.addAttachment);
router.delete('/:id/attachments/:attachmentId', ctrl.removeAttachment);

export default router;
