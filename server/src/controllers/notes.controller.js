import * as notes from '../services/notes.service.js';
import * as sharing from '../services/sharing.service.js';
import * as attachments from '../services/attachments.service.js';

/**
 * Controllers are deliberately thin: read the request, call a service, send
 * the result. If one of these ever grows an `if` about business rules, that
 * `if` belongs in a service instead.
 */

export async function list(req, res, next) {
  try {
    const { notes: found, nextCursor } = await notes.listNotes(req.userId, {
      view: req.query.view,
      labelId: req.query.label,
      q: req.query.q,
      cursor: req.query.cursor,
      limit: req.query.limit,
      sort: req.query.sort,
    });
    res.json({ notes: found.map((n) => n.toJSON()), nextCursor });
  } catch (err) { next(err); }
}

export async function get(req, res, next) {
  try {
    const note = await notes.getNote(req.userId, req.params.id);
    res.json({ note: note.toJSON() });
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const note = await notes.createNote(req.userId, req.body);
    res.status(201).json({ note: note.toJSON() });
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const { expectedVersion, ...patch } = req.body;
    const note = await notes.updateNote(req.userId, req.params.id, patch, { expectedVersion });
    res.json({ note: note.toJSON() });
  } catch (err) { next(err); }
}

export async function reorder(req, res, next) {
  try {
    res.json(await notes.reorderNotes(req.userId, req.body.order));
  } catch (err) { next(err); }
}

export async function trash(req, res, next) {
  try {
    const note = await notes.trashNote(req.userId, req.params.id);
    res.json({ note: note.toJSON() });
  } catch (err) { next(err); }
}

export async function restore(req, res, next) {
  try {
    const note = await notes.restoreNote(req.userId, req.params.id);
    res.json({ note: note.toJSON() });
  } catch (err) { next(err); }
}

export async function destroy(req, res, next) {
  try {
    res.json(await notes.deleteNoteForever(req.userId, req.params.id));
  } catch (err) { next(err); }
}

export async function emptyTrash(req, res, next) {
  try {
    res.json(await notes.emptyTrash(req.userId));
  } catch (err) { next(err); }
}

export async function versions(req, res, next) {
  try {
    const found = await notes.listVersions(req.userId, req.params.id);
    res.json({ versions: found.map((v) => v.toJSON()) });
  } catch (err) { next(err); }
}

export async function restoreVersion(req, res, next) {
  try {
    const note = await notes.restoreVersion(req.userId, req.params.id, req.params.version);
    res.json({ note: note.toJSON() });
  } catch (err) { next(err); }
}

export async function activity(req, res, next) {
  try {
    const found = await notes.listActivity(req.userId, req.params.id, req.query.limit);
    res.json({ activity: found.map((a) => a.toJSON()) });
  } catch (err) { next(err); }
}

export async function stats(req, res, next) {
  try {
    res.json(await notes.stats(req.userId));
  } catch (err) { next(err); }
}

/* ---------------------------------------------------------------- sharing */

export async function collaborators(req, res, next) {
  try {
    res.json(await sharing.listCollaborators(req.userId, req.params.id));
  } catch (err) { next(err); }
}

export async function share(req, res, next) {
  try {
    res.status(201).json(await sharing.shareNote(req.userId, req.params.id, req.body));
  } catch (err) { next(err); }
}

export async function updateCollaborator(req, res, next) {
  try {
    res.json(
      await sharing.updateCollaborator(req.userId, req.params.id, req.params.userId, req.body)
    );
  } catch (err) { next(err); }
}

export async function revokeShare(req, res, next) {
  try {
    res.json(await sharing.revokeShare(req.userId, req.params.id, req.params.userId));
  } catch (err) { next(err); }
}

export async function leave(req, res, next) {
  try {
    res.json(await sharing.leaveNote(req.userId, req.params.id));
  } catch (err) { next(err); }
}

/* ------------------------------------------------------------ attachments */

export async function addAttachment(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file received', code: 'no_file' } });
    }
    const note = await attachments.addAttachment(req.userId, req.params.id, req.file);
    return res.status(201).json({ note: note.toJSON() });
  } catch (err) { return next(err); }
}

export async function removeAttachment(req, res, next) {
  try {
    const note = await attachments.removeAttachment(
      req.userId, req.params.id, req.params.attachmentId
    );
    res.json({ note: note.toJSON() });
  } catch (err) { next(err); }
}
