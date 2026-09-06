import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import {
  registerSchema, loginSchema, settingsSchema, changePasswordSchema,
  forgotPasswordSchema, resetPasswordSchema,
  twoFactorConfirmSchema, twoFactorDisableSchema,
} from './schemas.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * Sign-in and password reset are the endpoints worth guessing at, so they are
 * the ones that get their own limits.
 *
 * Note `skip` and not `limit: 0` — in express-rate-limit v7 a limit of zero
 * blocks every request rather than disabling the limiter. That mistake failed
 * 35 of 36 tests the first time this was written.
 */
const limiter = (limit, windowMinutes = 15) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    skip: () => env.isTest,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts, try again later', code: 'rate_limited' } },
  });

const authLimiter = limiter(env.authRateLimit);
const resetLimiter = limiter(5, 60);

router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', requireAuth, ctrl.logout);
router.post('/logout-everywhere', requireAuth, ctrl.logoutEverywhere);
router.get('/me', requireAuth, ctrl.me);

router.patch('/settings', requireAuth, validate(settingsSchema), ctrl.updateSettings);
router.post('/change-password', requireAuth, validate(changePasswordSchema), ctrl.changePassword);

router.get('/sessions', requireAuth, ctrl.sessions);
router.delete('/sessions/:sessionId', requireAuth, ctrl.revokeSession);

router.post('/forgot-password', resetLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password', resetLimiter, validate(resetPasswordSchema), ctrl.resetPassword);

router.get('/2fa', requireAuth, ctrl.twoFactorStatus);
router.post('/2fa/setup', requireAuth, ctrl.twoFactorSetup);
router.post('/2fa/confirm', requireAuth, validate(twoFactorConfirmSchema), ctrl.twoFactorConfirm);
router.post('/2fa/disable', requireAuth, validate(twoFactorDisableSchema), ctrl.twoFactorDisable);

export default router;
