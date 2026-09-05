import mongoose from 'mongoose';

export const ACTIONS = [
  'created', 'edited', 'restored_version', 'pinned', 'unpinned',
  'archived', 'unarchived', 'trashed', 'untrashed',
  'shared', 'unshared', 'role_changed', 'attached', 'detached',
  'reminder_set', 'reminder_cleared',
];

/**
 * Who did what to a note, and when.
 *
 * The version history answers "what did this note say"; the activity log
 * answers "who changed it". Once a note has more than one person on it those
 * are different questions, and only one of them is answerable from snapshots.
 */
const activitySchema = new mongoose.Schema(
  {
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ACTIONS, required: true },
    // Free-form detail for the sentence the UI renders: a label name, a
    // collaborator's email, the version restored to.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ note: 1, createdAt: -1 });

activitySchema.methods.toJSON = function toJSON() {
  const o = this.toObject();
  const actor = o.actor && o.actor.name
    ? { id: o.actor._id.toString(), name: o.actor.name, email: o.actor.email }
    : { id: String(o.actor) };
  return {
    id: o._id.toString(),
    noteId: o.note.toString(),
    actor,
    action: o.action,
    meta: o.meta || {},
    createdAt: o.createdAt,
  };
};

export const Activity = mongoose.model('Activity', activitySchema);
