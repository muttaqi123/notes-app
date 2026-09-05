import { z } from 'zod';
import { NOTE_COLORS } from '../models/Note.js';

/**
 * The request contract, in one file.
 *
 * Every route validates its body here before a service sees it, and zod
 * strips unknown keys rather than passing them inward — so a client cannot
 * set a field simply by inventing it, and no service has to defend against
 * shapes that never arrive.
 */

const password = z.string().min(8, 'Use at least 8 characters').max(200);
const email = z.string().trim().email('That does not look like an email');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
  // Only sent on the second attempt, once the server has said it is needed.
  twoFactorCode: z.string().trim().max(20).optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  defaultView: z.enum(['active', 'archive']).optional(),
  sort: z.enum(['updated', 'created', 'title', 'manual']).optional(),
});

export const twoFactorConfirmSchema = z.object({
  code: z.string().trim().min(6).max(10),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1),
});

const checklistItem = z.object({
  text: z.string().max(500).default(''),
  checked: z.boolean().default(false),
});

export const createNoteSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  type: z.enum(['note', 'checklist']).optional(),
  items: z.array(checklistItem).max(200).optional(),
  color: z.enum(NOTE_COLORS).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  labels: z.array(z.string()).max(50).optional(),
  remindAt: z.string().datetime().nullable().optional(),
});

// Every field optional: a PATCH says what changed, not what the note is.
export const updateNoteSchema = createNoteSchema.extend({
  order: z.number().optional(),
  // Optimistic concurrency: the version the client believes it is editing.
  // Optional, because a colour change does not need the protection — only the
  // editor sends it.
  expectedVersion: z.number().int().positive().optional(),
});

export const reorderSchema = z.object({
  order: z
    .array(z.object({ id: z.string(), order: z.number() }))
    .min(1)
    .max(200),
});

export const labelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().max(20).optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z.string().max(20).optional(),
});

export const shareSchema = z.object({
  email,
  role: z.enum(['viewer', 'editor']).default('viewer'),
});

export const roleSchema = z.object({
  role: z.enum(['viewer', 'editor']),
});
