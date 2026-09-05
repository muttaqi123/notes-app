import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { Note } from '../models/Note.js';
import { Activity } from '../models/Activity.js';
import { ApiError } from '../utils/ApiError.js';
import { authorize, LEVELS, audienceFor } from './permissions.js';
import { emitNoteChanged } from './events.js';
import { env } from '../config/env.js';

const MAX_ATTACHMENTS_PER_NOTE = 8;
const MAX_DIMENSION = 1600;

/**
 * Image attachments.
 *
 * Two things are deliberate here:
 *
 * 1. **The file is re-encoded, never stored as uploaded.** Passing an
 *    untrusted file straight to disk and serving it back means trusting the
 *    uploader about what it is; a `.png` that is actually an HTML document is
 *    stored XSS the moment a browser sniffs it. Decoding with sharp and
 *    re-encoding to WebP means whatever comes out is an image, because it was
 *    produced by an image encoder — and it strips EXIF, which routinely
 *    carries GPS coordinates the uploader did not mean to publish.
 *
 * 2. **The stored name is random, not the user's.** The uploaded filename is
 *    kept as a label for display and never touches the filesystem, so a name
 *    like `../../etc/passwd` is a string, not a path.
 */

export async function uploadDir() {
  await fs.mkdir(env.uploadDir, { recursive: true });
  return env.uploadDir;
}

export async function addAttachment(userId, noteId, file) {
  const { note } = await authorize(userId, noteId, LEVELS.WRITE);

  if (note.attachments.length >= MAX_ATTACHMENTS_PER_NOTE) {
    throw ApiError.badRequest(
      `A note can hold ${MAX_ATTACHMENTS_PER_NOTE} images`,
      'too_many_attachments'
    );
  }

  let pipeline;
  try {
    pipeline = sharp(file.buffer, { failOn: 'truncated' });
    // Reading the metadata is what proves the bytes really are an image: it
    // throws for anything sharp cannot decode, before a single byte is written.
    await pipeline.metadata();
  } catch {
    throw ApiError.badRequest('That file is not an image we can read', 'bad_image');
  }

  const key = `${crypto.randomUUID()}.webp`;
  const dir = await uploadDir();

  const output = await pipeline
    .rotate() // Honour the EXIF orientation before it is stripped.
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  await fs.writeFile(path.join(dir, key), output.data);

  note.attachments.push({
    filename: String(file.originalname || 'image').slice(0, 120),
    mimetype: 'image/webp',
    size: output.info.size,
    width: output.info.width,
    height: output.info.height,
    key,
    uploadedBy: userId,
  });
  await note.save();

  const fresh = await Note.findById(noteId)
    .populate('labels')
    .populate('owner', 'name email avatarColor');

  const audience = await audienceFor(noteId, fresh.owner._id ?? fresh.owner);
  emitNoteChanged(fresh.toJSON(), audience, userId);
  await Activity.create({
    note: noteId, actor: userId, action: 'attached', meta: { filename: file.originalname },
  });

  return fresh;
}

export async function removeAttachment(userId, noteId, attachmentId) {
  const { note } = await authorize(userId, noteId, LEVELS.WRITE);

  const attachment = note.attachments.id(attachmentId);
  if (!attachment) throw ApiError.notFound('No such attachment', 'no_attachment');

  const { key, filename } = attachment;
  attachment.deleteOne();
  await note.save();

  // The row goes first. An orphaned file wastes disk; a row pointing at a file
  // that is gone is a broken image in someone's note.
  try {
    await fs.unlink(path.join(env.uploadDir, key));
  } catch {
    // Already gone is the desired end state either way.
  }

  const fresh = await Note.findById(noteId)
    .populate('labels')
    .populate('owner', 'name email avatarColor');

  const audience = await audienceFor(noteId, fresh.owner._id ?? fresh.owner);
  emitNoteChanged(fresh.toJSON(), audience, userId);
  await Activity.create({ note: noteId, actor: userId, action: 'detached', meta: { filename } });

  return fresh;
}
