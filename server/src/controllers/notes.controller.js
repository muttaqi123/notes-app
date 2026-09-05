import * as notes from '../services/notes.service.js';

/**
 * Controllers are deliberately three lines each: read the request, call a
 * service, send the result. If one of these ever grows an `if`, that `if`
 * belongs in the service instead.
 */

export async function list(req, res, next) {
  try {
    const found = await notes.listNotes(req.userId, {
      view: req.query.view,
      labelId: req.query.label,
      q: req.query.q,
    });
    res.json({ notes: found.map((n) => n.toJSON()) });
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
    const note = await notes.updateNote(req.userId, req.params.id, req.body);
    res.json({ note: note.toJSON() });
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

export async function stats(req, res, next) {
  try {
    res.json(await notes.stats(req.userId));
  } catch (err) { next(err); }
}
