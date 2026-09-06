import mongoose from 'mongoose';
import { Note } from '../models/Note.js';
import { NoteVersion } from '../models/NoteVersion.js';
import { Label } from '../models/Label.js';
import { Activity } from '../models/Activity.js';
import { ApiError } from '../utils/ApiError.js';
import { authorize, LEVELS, audienceFor, sharedNoteIds, assertObjectId } from './permissions.js';
import { emitNoteChanged, emitNoteRemoved, emitActivity } from './events.js';

/**
 * All note business logic. Nothing here imports Express, knows what a request
 * is, or builds a response — it takes plain values and returns plain values.
 *
 * Real-time updates do not break that rule: a change is announced on the
 * in-process event bus, and whether anything is listening is not this layer's
 * concern. The test suite runs with nothing subscribed.
 */

const CONTENT_FIELDS = ['title', 'body', 'type', 'items', 'color', 'labels'];
const PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

const populated = (q) => q.populate('labels').populate('owner', 'name email avatarColor');

/** Keep only label ids that belong to this user, so a client cannot attach
 *  someone else's label by guessing its id. */
async function sanitiseLabels(ownerId, labelIds) {
  if (!Array.isArray(labelIds) || labelIds.length === 0) return [];
  const ids = labelIds.filter((id) => mongoose.isValidObjectId(id));
  const owned = await Label.find({ _id: { $in: ids }, owner: ownerId }).select('_id');
  return owned.map((l) => l._id);
}

function snapshotOf(note, actorId, reason = 'edit') {
  return {
    note: note._id,
    owner: note.owner?._id ?? note.owner,
    author: actorId,
    version: note.version,
    title: note.title,
    body: note.body,
    type: note.type,
    items: (note.items || []).map((i) => ({ text: i.text, checked: i.checked })),
    color: note.color,
    labels: (note.labels || []).map((l) => (l._id ? l._id : l)),
    reason,
  };
}

const itemKey = (items) => (items || []).map((i) => `${i.checked ? 1 : 0}:${i.text}`).join(' ');
const labelKey = (labels) => (labels || []).map((l) => String(l._id || l)).sort().join(',');

/** True when a patch would change something a version should be kept for.
 *  Pinning or archiving is not an edit to the note's content, so it must not
 *  push a meaningless entry into the history. */
function touchesContent(note, patch) {
  return CONTENT_FIELDS.some((field) => {
    if (!(field in patch)) return false;
    if (field === 'items') return itemKey(note.items) !== itemKey(patch.items);
    if (field === 'labels') return labelKey(note.labels) !== labelKey(patch.labels);
    return note[field] !== patch[field];
  });
}

function escapeRegex(input) {
  return input.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

async function log(noteId, actorId, action, meta = {}, audience = null) {
  const activity = await Activity.create({ note: noteId, actor: actorId, action, meta });
  const populatedActivity = await activity.populate('actor', 'name email');
  if (audience) emitActivity(noteId, audience, populatedActivity.toJSON());
  return populatedActivity;
}

async function announce(note, actorId) {
  const ownerId = note.owner?._id ?? note.owner;
  const audience = await audienceFor(note._id, ownerId);
  emitNoteChanged(note.toJSON(), audience, actorId);
  return audience;
}

/* ------------------------------------------------------------------ lists */

/**
 * The board.
 *
 * Cursor pagination rather than skip/limit: `skip` has to walk and discard
 * every row it skips, so page 50 costs fifty pages of work, and a note added
 * while you page shifts every subsequent row by one. A cursor is a position in
 * the sort, so it costs the same on page 50 as on page 1 and cannot duplicate
 * or drop a row underneath the reader.
 */
export async function listNotes(userId, opts = {}) {
  const {
    view = 'active', labelId, q, cursor, limit = PAGE_SIZE, sort = 'updated', includeShared = true,
  } = opts;

  const size = Math.min(Number(limit) || PAGE_SIZE, MAX_PAGE_SIZE);

  const ownership = includeShared && view !== 'trash'
    // The trash is personal: a collaborator deleting their copy of your note
    // is not a thing that should happen, so shared notes are excluded there.
    ? { $or: [{ owner: userId }, { _id: { $in: await sharedNoteIds(userId) } }] }
    : { owner: userId };

  const filter = { ...ownership };

  if (view === 'trash') {
    filter.trashedAt = { $ne: null };
  } else if (view === 'reminders') {
    filter.trashedAt = null;
    filter.remindAt = { $ne: null };
  } else if (view === 'shared') {
    filter.trashedAt = null;
    filter.owner = { $ne: userId };
    delete filter.$or;
    filter._id = { $in: await sharedNoteIds(userId) };
  } else {
    filter.trashedAt = null;
    filter.archived = view === 'archive';
  }

  if (labelId) {
    assertObjectId(labelId, 'label id');
    filter.labels = labelId;
  }

  if (q && q.trim()) {
    // A regex rather than the text index, because Keep-style search matches
    // partial words as you type and $text only matches whole terms.
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$and = [{ $or: [{ title: rx }, { body: rx }, { 'items.text': rx }] }];
  }

  const SORTS = {
    updated: { pinned: -1, updatedAt: -1, _id: -1 },
    created: { pinned: -1, createdAt: -1, _id: -1 },
    title: { pinned: -1, title: 1, _id: 1 },
    manual: { pinned: -1, order: 1, _id: 1 },
  };
  const order = SORTS[sort] || SORTS.updated;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) filter._id = { ...(filter._id || {}), $lt: decoded };
  }

  // One extra row is fetched purely to answer "is there another page" without
  // a second count query.
  const rows = await populated(Note.find(filter).sort(order).limit(size + 1));
  const hasMore = rows.length > size;
  const page = hasMore ? rows.slice(0, size) : rows;

  return {
    notes: page,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]._id) : null,
  };
}

const encodeCursor = (id) => Buffer.from(String(id)).toString('base64url');
function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    return mongoose.isValidObjectId(raw) ? new mongoose.Types.ObjectId(raw) : null;
  } catch {
    return null;
  }
}

export async function getNote(userId, noteId) {
  const { note } = await authorize(userId, noteId, LEVELS.READ);
  return note;
}

/* ----------------------------------------------------------------- writes */

function normaliseItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 200)
    .map((i) => ({ text: String(i?.text ?? '').slice(0, 500), checked: Boolean(i?.checked) }));
}

function isEmpty(note) {
  const hasText = Boolean((note.title || '').trim() || (note.body || '').trim());
  const hasItems = (note.items || []).some((i) => (i.text || '').trim());
  const hasFiles = (note.attachments || []).length > 0;
  return !hasText && !hasItems && !hasFiles;
}

export async function createNote(ownerId, input = {}) {
  const type = input.type === 'checklist' ? 'checklist' : 'note';
  const note = new Note({
    owner: ownerId,
    title: (input.title || '').trim(),
    body: type === 'checklist' ? '' : input.body || '',
    type,
    items: type === 'checklist' ? normaliseItems(input.items) : [],
    color: input.color || 'default',
    pinned: Boolean(input.pinned),
    archived: Boolean(input.archived),
    labels: await sanitiseLabels(ownerId, input.labels),
    remindAt: input.remindAt ? new Date(input.remindAt) : null,
    // New notes sort to the front of a manual ordering.
    order: Date.now() * -1,
    version: 1,
  });

  if (isEmpty(note)) {
    // Google Keep discards a note you open and close without typing. Doing the
    // same on the server means a client that always POSTs on close does not
    // litter the database with blank cards.
    throw ApiError.badRequest('An empty note is not saved', 'empty_note');
  }

  await note.save();
  await populated(Note.findById(note._id)).then((n) => Object.assign(note, n));

  await log(note._id, ownerId, 'created', {}, [String(ownerId)]);
  await announce(note, ownerId);
  return note;
}

/**
 * Update a note.
 *
 * `expectedVersion` is optimistic concurrency control. Two people editing one
 * note used to mean the second save silently erased the first; now the second
 * save is refused, and the caller is handed the note as it currently stands so
 * the conflict can be resolved rather than discovered later. It is optional,
 * because a colour change does not need it — only the editor sends it.
 */
export async function updateNote(userId, noteId, patch = {}, { expectedVersion } = {}) {
  const { note } = await authorize(userId, noteId, LEVELS.WRITE);
  const ownerId = note.owner?._id ?? note.owner;

  if (expectedVersion !== undefined && Number(expectedVersion) !== note.version) {
    const err = ApiError.conflict(
      'Someone else edited this note while you were writing',
      'version_conflict'
    );
    err.current = note.toJSON();
    throw err;
  }

  const next = {};
  if ('title' in patch) next.title = String(patch.title ?? '').trim();
  if ('body' in patch) next.body = String(patch.body ?? '');
  if ('type' in patch && ['note', 'checklist'].includes(patch.type)) next.type = patch.type;
  if ('items' in patch) next.items = normaliseItems(patch.items);
  if ('color' in patch) next.color = patch.color;
  if ('pinned' in patch) next.pinned = Boolean(patch.pinned);
  if ('archived' in patch) next.archived = Boolean(patch.archived);
  if ('order' in patch) next.order = Number(patch.order);
  // Labels belong to the owner's own set even when an editor attaches them.
  if ('labels' in patch) next.labels = await sanitiseLabels(ownerId, patch.labels);
  if ('remindAt' in patch) {
    next.remindAt = patch.remindAt ? new Date(patch.remindAt) : null;
    // Changing when to remind means the old "already sent" no longer applies.
    next.reminderSentAt = null;
  }

  const contentChanged = touchesContent(note, next);
  if (contentChanged) {
    await NoteVersion.create(snapshotOf(note, userId, 'edit'));
    note.version += 1;
  }

  Object.assign(note, next);

  // Pinning an archived note takes it out of the archive, which is what Keep
  // does and what a user pinning something plainly means.
  if (next.pinned === true && note.archived && !('archived' in patch)) {
    note.archived = false;
  }

  await note.save();
  const fresh = await populated(Note.findById(note._id));

  const audience = await announce(fresh, userId);

  if (contentChanged) await log(note._id, userId, 'edited', {}, audience);
  if ('pinned' in patch) await log(note._id, userId, patch.pinned ? 'pinned' : 'unpinned', {}, audience);
  if ('archived' in patch) await log(note._id, userId, patch.archived ? 'archived' : 'unarchived', {}, audience);
  if ('remindAt' in patch) {
    await log(note._id, userId, patch.remindAt ? 'reminder_set' : 'reminder_cleared',
      { remindAt: next.remindAt }, audience);
  }

  return fresh;
}

/** Reorder several notes in one request. Dragging a card produces one write,
 *  not one per card that shifted, because the order is a float. */
export async function reorderNotes(userId, entries = []) {
  const ids = entries.map((e) => e.id).filter((id) => mongoose.isValidObjectId(id));
  const owned = await Note.find({ _id: { $in: ids }, owner: userId }).select('_id');
  const allowed = new Set(owned.map((n) => String(n._id)));

  const ops = entries
    .filter((e) => allowed.has(String(e.id)))
    .map((e) => ({
      updateOne: { filter: { _id: e.id }, update: { $set: { order: Number(e.order) } } },
    }));

  if (ops.length) await Note.bulkWrite(ops);
  return { reordered: ops.length };
}

export async function trashNote(userId, noteId) {
  // Only the owner may bin a note. A collaborator removing it for everyone is
  // not sharing, it is deletion with extra steps.
  const { note } = await authorize(userId, noteId, LEVELS.OWN);
  note.trashedAt = new Date();
  note.pinned = false;
  await note.save();
  const fresh = await populated(Note.findById(note._id));
  const audience = await announce(fresh, userId);
  await log(note._id, userId, 'trashed', {}, audience);
  return fresh;
}

export async function restoreNote(userId, noteId) {
  const { note } = await authorize(userId, noteId, LEVELS.OWN);
  note.trashedAt = null;
  await note.save();
  const fresh = await populated(Note.findById(note._id));
  const audience = await announce(fresh, userId);
  await log(note._id, userId, 'untrashed', {}, audience);
  return fresh;
}

/** The only operation that actually removes data, and it takes the note's
 *  versions, activity and shares with it so nothing is orphaned. */
export async function deleteNoteForever(userId, noteId) {
  const { note } = await authorize(userId, noteId, LEVELS.OWN, { populate: false });
  const audience = await audienceFor(note._id, note.owner);

  const { NoteShare } = await import('../models/NoteShare.js');
  await Promise.all([
    NoteVersion.deleteMany({ note: note._id }),
    Activity.deleteMany({ note: note._id }),
    NoteShare.deleteMany({ note: note._id }),
  ]);
  await note.deleteOne();

  emitNoteRemoved(noteId, audience, userId);
  return { id: noteId };
}

export async function emptyTrash(userId) {
  const notes = await Note.find({ owner: userId, trashedAt: { $ne: null } }).select('_id');
  const ids = notes.map((n) => n._id);
  if (!ids.length) return { deleted: 0 };

  const { NoteShare } = await import('../models/NoteShare.js');
  await Promise.all([
    NoteVersion.deleteMany({ note: { $in: ids } }),
    Activity.deleteMany({ note: { $in: ids } }),
    NoteShare.deleteMany({ note: { $in: ids } }),
  ]);
  await Note.deleteMany({ _id: { $in: ids } });

  ids.forEach((id) => emitNoteRemoved(id, [String(userId)], userId));
  return { deleted: ids.length };
}

/* --------------------------------------------------------------- versions */

export async function listVersions(userId, noteId) {
  await authorize(userId, noteId, LEVELS.READ, { populate: false });
  return NoteVersion.find({ note: noteId })
    .sort({ version: -1 })
    .limit(100)
    .populate('author', 'name email avatarColor');
}

/**
 * Restore a note to an earlier version. The current state is snapshotted
 * first, so restoring is itself undoable — a restore that turns out to be the
 * wrong choice is not a way to lose the newer text.
 */
export async function restoreVersion(userId, noteId, versionNumber) {
  const { note } = await authorize(userId, noteId, LEVELS.WRITE);
  const ownerId = note.owner?._id ?? note.owner;

  const target = await NoteVersion.findOne({ note: noteId, version: Number(versionNumber) });
  if (!target) throw ApiError.notFound('That version does not exist', 'no_version');

  await NoteVersion.create(snapshotOf(note, userId, 'restore'));

  note.title = target.title;
  note.body = target.body;
  note.type = target.type;
  note.items = (target.items || []).map((i) => ({ text: i.text, checked: i.checked }));
  note.color = target.color;
  note.labels = await sanitiseLabels(ownerId, (target.labels || []).map(String));
  note.version += 1;
  await note.save();

  const fresh = await populated(Note.findById(note._id));
  const audience = await announce(fresh, userId);
  await log(note._id, userId, 'restored_version', { version: Number(versionNumber) }, audience);
  return fresh;
}

/* --------------------------------------------------------------- activity */

export async function listActivity(userId, noteId, limit = 50) {
  await authorize(userId, noteId, LEVELS.READ, { populate: false });
  return Activity.find({ note: noteId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .populate('actor', 'name email avatarColor');
}

/* ------------------------------------------------------------------ stats */

/**
 * The insights screen. One aggregation rather than a dozen counts, because
 * the numbers must describe the same instant — six separate queries can each
 * be right and still disagree with each other.
 */
export async function stats(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));

  const [totals] = await Note.aggregate([
    { $match: { owner: uid } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $and: [{ $eq: ['$trashedAt', null] }, { $eq: ['$archived', false] }] }, 1, 0] } },
        archived: { $sum: { $cond: [{ $and: [{ $eq: ['$trashedAt', null] }, { $eq: ['$archived', true] }] }, 1, 0] } },
        trashed: { $sum: { $cond: [{ $ne: ['$trashedAt', null] }, 1, 0] } },
        pinned: { $sum: { $cond: ['$pinned', 1, 0] } },
        checklists: { $sum: { $cond: [{ $eq: ['$type', 'checklist'] }, 1, 0] } },
        withReminder: { $sum: { $cond: [{ $ne: ['$remindAt', null] }, 1, 0] } },
        totalEdits: { $sum: { $subtract: ['$version', 1] } },
        words: {
          $sum: {
            $size: {
              $filter: {
                input: { $split: [{ $ifNull: ['$body', ''] }, ' '] },
                cond: { $ne: ['$$this', ''] },
              },
            },
          },
        },
      },
    },
  ]);

  // Notes created per day for the last 30 days, zero-filled so the chart has
  // no gaps where nothing happened.
  //
  // Both sides of this bucket in UTC. `$dateToString` groups in UTC unless it
  // is told otherwise, so building the buckets with local midnight put them
  // out of step with the data by the UTC offset — the last bucket silently
  // came up empty for anyone east of Greenwich, for part of the day. Server
  // time is not the user's time either way; grouping consistently is what
  // matters, and doing it properly needs the client's zone, which the API does
  // not currently take.
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const perDay = await Note.aggregate([
    { $match: { owner: uid, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
  ]);
  const byDate = Object.fromEntries(perDay.map((d) => [d._id, d.count]));

  const timeline = [];
  for (let i = 0; i < 30; i += 1) {
    const day = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    timeline.push({ date: key, count: byDate[key] || 0 });
  }

  const byColor = await Note.aggregate([
    { $match: { owner: uid, trashedAt: null } },
    { $group: { _id: '$color', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const byLabel = await Note.aggregate([
    { $match: { owner: uid, trashedAt: null } },
    { $unwind: '$labels' },
    { $group: { _id: '$labels', count: { $sum: 1 } } },
    { $lookup: { from: 'labels', localField: '_id', foreignField: '_id', as: 'label' } },
    { $unwind: '$label' },
    { $project: { _id: 0, name: '$label.name', count: 1 } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const { NoteShare } = await import('../models/NoteShare.js');
  const [sharedByMe, sharedWithMe, labels] = await Promise.all([
    NoteShare.countDocuments({ owner: userId }),
    NoteShare.countDocuments({ user: userId }),
    Label.countDocuments({ owner: userId }),
  ]);

  // `_id` is an artefact of grouping on null; it is not part of the answer.
  const { _id, ...counts } = totals || {};

  return {
    totals: {
      total: 0, active: 0, archived: 0, trashed: 0, pinned: 0,
      checklists: 0, withReminder: 0, totalEdits: 0, words: 0,
      ...counts,
      labels,
      sharedByMe,
      sharedWithMe,
    },
    timeline,
    byColor: byColor.map((c) => ({ color: c._id, count: c.count })),
    byLabel,
  };
}
