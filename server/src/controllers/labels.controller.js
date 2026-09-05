import * as labels from '../services/labels.service.js';

const toJSON = (l) => ({ id: l._id.toString(), name: l.name, color: l.color });

export async function list(req, res, next) {
  try {
    const found = await labels.listLabels(req.userId);
    res.json({ labels: found.map(toJSON) });
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const label = await labels.createLabel(req.userId, req.body);
    res.status(201).json({ label: toJSON(label) });
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const label = await labels.renameLabel(req.userId, req.params.id, req.body);
    res.json({ label: toJSON(label) });
  } catch (err) { next(err); }
}

export async function destroy(req, res, next) {
  try {
    res.json(await labels.deleteLabel(req.userId, req.params.id));
  } catch (err) { next(err); }
}
