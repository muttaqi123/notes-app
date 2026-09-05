import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * A deterministic avatar colour, so the same person is the same colour on
 * every device without storing a preference or asking them to pick one.
 */
const AVATAR_COLORS = [
  '#d93025', '#e8710a', '#f9ab00', '#1e8e3e',
  '#12b5cb', '#1a73e8', '#7b1fa2', '#c2185b',
];

function colorFor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const settingsSchema = new mongoose.Schema(
  {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
    defaultView: { type: String, enum: ['active', 'archive'], default: 'active' },
    // 'updated' is the Keep default; 'manual' honours drag-and-drop order.
    sort: { type: String, enum: ['updated', 'created', 'title', 'manual'], default: 'updated' },
  },
  { _id: false }
);

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
    avatarColor: { type: String, default: '#1a73e8' },
    settings: { type: settingsSchema, default: () => ({}) },

    // Refresh tokens are stored hashed and per-device, so signing out one
    // device does not sign out the others, and a leaked database row is not
    // a usable token.
    refreshTokens: [
      {
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        userAgent: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Time-based one-time passwords. The secret is only trusted once the user
    // has proved they can read a code from it — `enabled` flips on
    // confirmation, never on setup, so a half-finished enrolment cannot lock
    // anyone out of their own account.
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, default: null },
      // Single-use recovery codes, stored hashed like any other credential.
      backupCodes: [{ codeHash: String, usedAt: { type: Date, default: null } }],
    },

    // A reset token is a credential, so only its hash is stored and it carries
    // its own short expiry.
    passwordReset: {
      tokenHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', function assignColor(next) {
  if (this.isNew && this.email) this.avatarColor = colorFor(this.email);
  next();
});

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatarColor: this.avatarColor,
    settings: this.settings ? this.settings.toObject?.() ?? this.settings : {},
    twoFactorEnabled: Boolean(this.twoFactor?.enabled),
  };
};

/** The shape another user is allowed to see — a collaborator chip, nothing more. */
userSchema.methods.toPeerJSON = function toPeerJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatarColor: this.avatarColor,
  };
};

export const User = mongoose.model('User', userSchema);
