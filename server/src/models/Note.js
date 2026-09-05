import mongoose from 'mongoose';

export const NOTE_COLORS = [
  'default', 'red', 'orange', 'yellow', 'green',
  'teal', 'blue', 'purple', 'pink', 'brown', 'gray',
];

const checklistItemSchema = new mongoose.Schema(
  {
    text: { type: String, default: '', maxlength: 500 },
    checked: { type: Boolean, default: false },
  },
  { _id: true }
);

const noteSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    // Markdown source. Rendered on the client; stored exactly as typed so
    // nothing about the user's text is lost to a rendering decision.
    body: { type: String, default: '', maxlength: 20000 },
    type: { type: String, enum: ['note', 'checklist'], default: 'note' },
    items: { type: [checklistItemSchema], default: [] },
    color: { type: String, enum: NOTE_COLORS, default: 'default' },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    // Soft delete. A note in the trash keeps its row so it can come back;
    // hard deletion is a separate, explicit action.
    trashedAt: { type: Date, default: null },
    labels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Label' }],
    // Monotonic, bumped on every content-changing edit. The version history
    // stores the state *before* each edit, keyed by this number.
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// The list query is always "this user's notes, newest first, pinned on top",
// so index exactly that.
noteSchema.index({ owner: 1, pinned: -1, updatedAt: -1 });
// Server-side full-text search, used when the client asks the API rather than
// filtering the notes it already holds.
noteSchema.index({ title: 'text', body: 'text' });

noteSchema.methods.toJSON = function toJSON() {
  const o = this.toObject({ virtuals: false });
  return {
    id: o._id.toString(),
    title: o.title,
    body: o.body,
    type: o.type,
    items: (o.items || []).map((i) => ({
      id: i._id.toString(),
      text: i.text,
      checked: i.checked,
    })),
    color: o.color,
    pinned: o.pinned,
    archived: o.archived,
    trashed: Boolean(o.trashedAt),
    trashedAt: o.trashedAt,
    labels: (o.labels || []).map((l) =>
      l && l._id ? { id: l._id.toString(), name: l.name, color: l.color } : l.toString()
    ),
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

export const Note = mongoose.model('Note', noteSchema);
