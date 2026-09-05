import { z } from 'zod';
import { NOTE_COLORS } from '../models/Note.js';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email: z.string().trim().email('That does not look like an email'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email('That does not look like an email'),
  password: z.string().min(1, 'Enter your password'),
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
});

// Every field optional: a PATCH says what changed, not what the note is.
export const updateNoteSchema = createNoteSchema;

export const labelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().max(20).optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z.string().max(20).optional(),
});
