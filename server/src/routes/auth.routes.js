import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { registerSchema, loginSchema } from './schemas.js';
import { env } from '../config/env.js';

const router = Router();

// Sign-in is the one endpoint worth guessing at, so it is the one endpoint
// that gets its own limit. Skipped under test, where forty registrations in a
// second is the suite doing its job rather than an attack. Note `skip` and not
// `limit: 0` — in express-rate-limit v7 a limit of zero blocks every request.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: () => env.isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, try again later', code: 'rate_limited' } },
});

router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', requireAuth, ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

export default router;
