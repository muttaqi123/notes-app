import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    // A colour on the label itself, so the tag chips read at a glance.
    color: { type: String, default: 'default' },
  },
  { timestamps: true }
);

// A user cannot have two labels of the same name; two different users can.
labelSchema.index({ owner: 1, name: 1 }, { unique: true });

export const Label = mongoose.model('Label', labelSchema);
