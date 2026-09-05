import mongoose from 'mongoose';

export const SHARE_ROLES = ['viewer', 'editor'];

/**
 * One person's access to one note they do not own.
 *
 * A separate collection rather than an array on the note, because the query
 * that matters most runs the other way: "which notes is this user allowed to
 * see". With an index on the recipient that is one lookup; with an array on
 * the note it is a scan of every note in the database.
 */
const noteShareSchema = new mongoose.Schema(
  {
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    // Denormalised so "notes shared BY me" needs no join back to the note.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: SHARE_ROLES, default: 'viewer' },
  },
  { timestamps: true }
);

// One row per person per note: re-sharing changes the role, it does not stack.
noteShareSchema.index({ note: 1, user: 1 }, { unique: true });

export const NoteShare = mongoose.model('NoteShare', noteShareSchema);
