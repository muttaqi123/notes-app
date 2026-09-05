import mongoose from 'mongoose';
import { Label } from '../models/Label.js';
import { Note } from '../models/Note.js';
import { ApiError } from '../utils/ApiError.js';

export async function listLabels(ownerId) {
  return Label.find({ owner: ownerId }).sort({ name: 1 });
}

export async function createLabel(ownerId, { name, color = 'default' }) {
  const clean = String(name || '').trim();
  if (!clean) throw ApiError.badRequest('A label needs a name', 'empty_label');

  const existing = await Label.findOne({ owner: ownerId, name: clean });
  if (existing) throw ApiError.conflict('You already have a label with that name', 'label_taken');

  return Label.create({ owner: ownerId, name: clean, color });
}

export async function renameLabel(ownerId, labelId, { name, color }) {
  if (!mongoose.isValidObjectId(labelId)) throw ApiError.badRequest('Invalid label id', 'bad_id');
  const label = await Label.findOne({ _id: labelId, owner: ownerId });
  if (!label) throw ApiError.notFound('Label not found', 'no_label');

  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) throw ApiError.badRequest('A label needs a name', 'empty_label');
    const clash = await Label.findOne({ owner: ownerId, name: clean, _id: { $ne: labelId } });
    if (clash) throw ApiError.conflict('You already have a label with that name', 'label_taken');
    label.name = clean;
  }
  if (color !== undefined) label.color = color;

  await label.save();
  return label;
}

/**
 * Deleting a label detaches it from every note rather than deleting those
 * notes. Losing a tag must never be a way to lose the writing under it.
 */
export async function deleteLabel(ownerId, labelId) {
  if (!mongoose.isValidObjectId(labelId)) throw ApiError.badRequest('Invalid label id', 'bad_id');
  const label = await Label.findOne({ _id: labelId, owner: ownerId });
  if (!label) throw ApiError.notFound('Label not found', 'no_label');

  await Note.updateMany({ owner: ownerId, labels: labelId }, { $pull: { labels: labelId } });
  await label.deleteOne();
  return { id: labelId };
}
