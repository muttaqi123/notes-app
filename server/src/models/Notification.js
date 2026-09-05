import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = ['reminder', 'shared_with_you', 'share_revoked', 'note_edited'];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    // Null until read, rather than a boolean, so "when did they see this"
    // stays answerable.
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });

notificationSchema.methods.toJSON = function toJSON() {
  const o = this.toObject();
  return {
    id: o._id.toString(),
    type: o.type,
    noteId: o.note ? o.note.toString() : null,
    title: o.title,
    body: o.body,
    read: Boolean(o.readAt),
    createdAt: o.createdAt,
  };
};

export const Notification = mongoose.model('Notification', notificationSchema);
