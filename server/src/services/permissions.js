import mongoose from 'mongoose';
import { Note } from '../models/Note.js';
import { NoteShare } from '../models/NoteShare.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Who may do what to a note.
 *
 * Every note operation goes through here, so there is exactly one answer to
 * "can this person do this" rather than a check repeated — and eventually
 * forgotten — in each service function.
 *
 * Three levels, each strictly containing the next:
 *
 *   read   owner, editors, viewers      see the note and its history
 *   write  owner, editors               edit the content
 *   own    owner only                   share, delete, change collaborators
 */
export const LEVELS = { READ: 'read', WRITE: 'write', OWN: 'own' };

const RANK = { viewer: 1, editor: 2, owner: 3 };
const REQUIRED = { read: 1, write: 2, own: 3 };

export function assertObjectId(id, what = 'id') {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest(`Invalid ${what}`, 'bad_id');
  }
}

/**
 * The caller's role on a note, or null if they have none.
 * Owner is checked first so the owner never needs a share row.
 */
export async function roleOn(userId, noteId) {
  const note = await Note.findById(noteId).select('owner');
  if (!note) return { note: null, role: null };
  if (String(note.owner) === String(userId)) return { note, role: 'owner' };

  const share = await NoteShare.findOne({ note: noteId, user: userId }).select('role');
  return { note, role: share ? share.role : null };
}

/**
 * Load a note the caller may act on at the given level, or throw.
 *
 * Failures are 404, not 403, at every level — including a viewer trying to
 * edit. A 403 tells the caller the note exists and that they guessed a real
 * id; a 404 tells them nothing they did not already know.
 */
export async function authorize(userId, noteId, level = LEVELS.READ, { populate = true } = {}) {
  assertObjectId(noteId, 'note id');

  const q = Note.findById(noteId);
  if (populate) q.populate('labels').populate('owner', 'name email avatarColor');
  const note = await q;
  if (!note) throw ApiError.notFound('Note not found', 'no_note');

  const ownerId = note.owner?._id ? note.owner._id : note.owner;
  let role = null;
  if (String(ownerId) === String(userId)) {
    role = 'owner';
  } else {
    const share = await NoteShare.findOne({ note: noteId, user: userId }).select('role');
    role = share ? share.role : null;
  }

  if (!role || RANK[role] < REQUIRED[level]) {
    throw ApiError.notFound('Note not found', 'no_note');
  }

  return { note, role };
}

/**
 * Everyone who should be told when this note changes: the owner plus every
 * collaborator. Used to address real-time events and nothing else.
 */
export async function audienceFor(noteId, ownerId) {
  const shares = await NoteShare.find({ note: noteId }).select('user');
  return [String(ownerId), ...shares.map((s) => String(s.user))];
}

/** The note ids this user can see but does not own. */
export async function sharedNoteIds(userId) {
  const shares = await NoteShare.find({ user: userId }).select('note');
  return shares.map((s) => s.note);
}
