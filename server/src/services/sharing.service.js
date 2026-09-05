import { NoteShare, SHARE_ROLES } from '../models/NoteShare.js';
import { User } from '../models/User.js';
import { Activity } from '../models/Activity.js';
import { ApiError } from '../utils/ApiError.js';
import { authorize, LEVELS, audienceFor } from './permissions.js';
import { emitNoteChanged, emitNoteRemoved } from './events.js';
import { notify } from './notifications.service.js';

/**
 * Who a note is shared with, and at what level.
 *
 * Only the owner can change any of this. An editor being able to add more
 * editors is a permission system that quietly stops being one.
 */

export async function listCollaborators(userId, noteId) {
  const { note, role } = await authorize(userId, noteId, LEVELS.READ, { populate: false });

  const shares = await NoteShare.find({ note: noteId }).populate('user', 'name email avatarColor');
  const owner = await User.findById(note.owner).select('name email avatarColor');

  return {
    // The viewer's own role, so the UI can grey out what they cannot do
    // rather than offering it and failing.
    myRole: role,
    owner: owner ? owner.toPeerJSON() : null,
    collaborators: shares.map((s) => ({
      ...s.user.toPeerJSON(),
      role: s.role,
      sharedAt: s.createdAt,
    })),
  };
}

export async function shareNote(userId, noteId, { email, role = 'viewer' }) {
  if (!SHARE_ROLES.includes(role)) {
    throw ApiError.badRequest('Role must be viewer or editor', 'bad_role');
  }

  const { note } = await authorize(userId, noteId, LEVELS.OWN, { populate: false });

  const recipient = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!recipient) {
    // Deliberately explicit. This is not a login form — telling the owner that
    // nobody holds that address is the difference between a working feature
    // and a silent no-op, and the address was typed by someone who already
    // knows the person.
    throw ApiError.notFound('Nobody here uses that email address', 'no_recipient');
  }
  if (String(recipient._id) === String(userId)) {
    throw ApiError.badRequest('You already own this note', 'share_self');
  }

  const existing = await NoteShare.findOne({ note: noteId, user: recipient._id });
  if (existing) {
    // Re-sharing changes the role rather than failing or stacking a duplicate.
    existing.role = role;
    await existing.save();
  } else {
    await NoteShare.create({ note: noteId, owner: note.owner, user: recipient._id, role });
  }

  const actor = await User.findById(userId).select('name');
  await Activity.create({
    note: noteId,
    actor: userId,
    action: existing ? 'role_changed' : 'shared',
    meta: { email: recipient.email, role },
  });

  await notify(recipient._id, {
    type: 'shared_with_you',
    note: noteId,
    title: `${actor?.name || 'Someone'} shared a note with you`,
    body: note.title || 'Untitled note',
  });

  // The recipient's other tabs need the note itself, not just the alert.
  const { Note } = await import('../models/Note.js');
  const fresh = await Note.findById(noteId)
    .populate('labels')
    .populate('owner', 'name email avatarColor');
  const audience = await audienceFor(noteId, note.owner);
  emitNoteChanged(fresh.toJSON(), audience, userId);

  return listCollaborators(userId, noteId);
}

export async function updateCollaborator(userId, noteId, collaboratorId, { role }) {
  if (!SHARE_ROLES.includes(role)) {
    throw ApiError.badRequest('Role must be viewer or editor', 'bad_role');
  }
  await authorize(userId, noteId, LEVELS.OWN, { populate: false });

  const share = await NoteShare.findOne({ note: noteId, user: collaboratorId });
  if (!share) throw ApiError.notFound('They do not have access to this note', 'no_share');

  share.role = role;
  await share.save();

  await Activity.create({
    note: noteId, actor: userId, action: 'role_changed', meta: { role },
  });

  return listCollaborators(userId, noteId);
}

export async function revokeShare(userId, noteId, collaboratorId) {
  const { note } = await authorize(userId, noteId, LEVELS.OWN, { populate: false });

  const share = await NoteShare.findOne({ note: noteId, user: collaboratorId });
  if (!share) throw ApiError.notFound('They do not have access to this note', 'no_share');

  // Captured before the delete: after it, they are no longer in the audience,
  // and the whole point is to tell them the note has gone.
  const removedUser = String(share.user);
  await share.deleteOne();

  await Activity.create({ note: noteId, actor: userId, action: 'unshared', meta: {} });

  await notify(removedUser, {
    type: 'share_revoked',
    note: null,
    title: 'A note is no longer shared with you',
    body: note.title || 'Untitled note',
  });

  // To them the note has ceased to exist, which is exactly the "removed"
  // event — their board should drop the card without a refresh.
  emitNoteRemoved(noteId, [removedUser], userId);

  return listCollaborators(userId, noteId);
}

/** Leaving a note someone shared with you. The one share operation that is
 *  not the owner's to perform. */
export async function leaveNote(userId, noteId) {
  const share = await NoteShare.findOne({ note: noteId, user: userId });
  if (!share) throw ApiError.notFound('Note not found', 'no_note');
  await share.deleteOne();
  emitNoteRemoved(noteId, [String(userId)], userId);
  return { left: true };
}
