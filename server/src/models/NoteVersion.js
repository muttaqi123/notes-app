import mongoose from 'mongoose';

/**
 * One row per edit: the snapshot of a note *before* an edit was applied.
 *
 * Kept in a separate collection rather than an array on the note, because
 * versions are written on every edit and read almost never — an unbounded
 * array would make every note document grow without limit and slow down the
 * list query, which is the hot path.
 */
const noteVersionSchema = new mongoose.Schema(
  {
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, required: true },
    title: String,
    body: String,
    type: String,
    items: [{ text: String, checked: Boolean }],
    color: String,
    labels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Label' }],
    // What triggered the snapshot: 'edit' | 'restore'
    reason: { type: String, default: 'edit' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

noteVersionSchema.index({ note: 1, version: -1 });

noteVersionSchema.methods.toJSON = function toJSON() {
  const o = this.toObject();
  return {
    id: o._id.toString(),
    noteId: o.note.toString(),
    version: o.version,
    title: o.title,
    body: o.body,
    type: o.type,
    items: (o.items || []).map((i) => ({ text: i.text, checked: i.checked })),
    color: o.color,
    reason: o.reason,
    createdAt: o.createdAt,
  };
};

export const NoteVersion = mongoose.model('NoteVersion', noteVersionSchema);
