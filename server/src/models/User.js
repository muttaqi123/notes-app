import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never the password itself. bcrypt, cost 12.
    passwordHash: { type: String, required: true },
    // Refresh tokens are stored hashed and per-device, so signing out one
    // device does not sign out the others, and a leaked database row is not
    // a usable token.
    refreshTokens: [
      {
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return { id: this._id.toString(), name: this.name, email: this.email };
};

export const User = mongoose.model('User', userSchema);
