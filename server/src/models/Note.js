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

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    // A path relative to the upload mount, never an absolute disk path —
    // moving the storage directory must not require rewriting every row.
    key: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
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

    attachments: { type: [attachmentSchema], default: [] },

    // When to remind, and when the reminder actually went out. Written after
    // the notification is created, so a crash mid-sweep retries rather than
    // going silent.
    remindAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },

    // Manual ordering, used only when the user has chosen the "manual" sort.
    // A float, so dropping a note between two others is one write rather than
    // a renumbering of everything after it.
    order: { type: Number, default: 0 },

    // Monotonic, bumped on every content-changing edit. The version history
    // stores the state before each edit, keyed by this number, and a client
    // sends it back on PATCH so a stale write can be refused.
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// The board query is always "this user's notes, pinned on top, newest first".
noteSchema.index({ owner: 1, pinned: -1, updatedAt: -1 });
// Server-side full-text search, used once a user has more notes than the
// client holds in memory.
noteSchema.index({ title: 'text', body: 'text' });
// The reminder sweep: due, not yet sent, not in the trash.
noteSchema.index({ remindAt: 1, reminderSentAt: 1 });

noteSchema.methods.toJSON = function toJSON() {
  const o = this.toObject({ virtuals: false });
  return {
    id: o._id.toString(),
    owner: o.owner && o.owner.name
      ? { id: o.owner._id.toString(), name: o.owner.name, email: o.owner.email, avatarColor: o.owner.avatarColor }
      : { id: String(o.owner) },
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
      l && l._id ? { id: l._id.toString(), name: l.name, color: l.color } : String(l)
    ),
    attachments: (o.attachments || []).map((a) => ({
      id: a._id.toString(),
      filename: a.filename,
      mimetype: a.mimetype,
      size: a.size,
      width: a.width,
      height: a.height,
      url: `/uploads/${a.key}`,
    })),
    remindAt: o.remindAt,
    reminderSent: Boolean(o.reminderSentAt),
    order: o.order,
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

export const Note = mongoose.model('Note', noteSchema);
