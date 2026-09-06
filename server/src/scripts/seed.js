import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Label } from '../models/Label.js';
import { Note } from '../models/Note.js';
import { NoteVersion } from '../models/NoteVersion.js';
import { NoteShare } from '../models/NoteShare.js';
import { Activity } from '../models/Activity.js';
import { Notification } from '../models/Notification.js';

/**
 * Fills two demo accounts with notes worth looking at.
 *
 * Two, not one, because half the app is about collaboration and a single
 * account cannot demonstrate a shared note, a collaborator's edit in the
 * activity log, or an avatar that is not yours.
 *
 *   npm run seed
 *
 * Safe to re-run: it deletes the demo users' own data first and touches
 * nothing else.
 */

const DEMO = {
  name: 'Demo User',
  email: 'demo@keepnotes.app',
  password: 'demo-password-123',
};

const TEAMMATE = {
  name: 'Sara Ahmed',
  email: 'sara@keepnotes.app',
  password: 'demo-password-123',
};

const LABELS = ['Work', 'Personal', 'Ideas', 'Reading'];

const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000);
const daysAgo = (d) => new Date(Date.now() - d * 86400_000);

const NOTES = [
  {
    title: 'Markdown actually works here',
    body: `Google Keep gives you plain text. This gives you **markdown**.

## What that buys you
- \`inline code\` and fenced blocks
- [links](https://developer.mozilla.org)
- headings, lists, quotes

> The note is stored exactly as typed and rendered on the client,
> so nothing is lost to a rendering decision.`,
    color: 'yellow',
    pinned: true,
    labels: ['Ideas'],
  },
  {
    title: 'Sprint 14 — standup',
    body: `**Done**\n- refresh-token rotation merged\n- masonry on mobile\n- dark mode\n\n**Next**\n- version diffing\n- empty-state copy`,
    color: 'blue',
    labels: ['Work'],
    remindAt: hoursFromNow(3),
  },
  {
    title: 'Groceries',
    type: 'checklist',
    items: [
      { text: 'Coffee beans', checked: false },
      { text: 'Olive oil', checked: false },
      { text: 'Bread', checked: true },
      { text: 'Tomatoes', checked: true },
    ],
    color: 'green',
    pinned: true,
    labels: ['Personal'],
  },
  {
    title: 'Reading list',
    body: `1. *Designing Data-Intensive Applications* — Kleppmann\n2. *The Pragmatic Programmer*\n3. *Refactoring UI* — for the parts of this that still look like a form`,
    color: 'purple',
    labels: ['Reading'],
  },
  {
    title: 'Deploy checklist',
    type: 'checklist',
    items: [
      { text: 'Set JWT secrets in the dashboard, not the repo', checked: true },
      { text: 'Point CORS_ORIGIN at the deployed client', checked: true },
      { text: 'Atlas network access allows the API', checked: false },
      { text: 'Health check green', checked: false },
      { text: 'Restore drill on a real backup', checked: false },
    ],
    color: 'teal',
    labels: ['Work'],
    remindAt: hoursFromNow(30),
  },
  {
    title: 'Why the refresh token is a cookie',
    body: `A token in \`localStorage\` is readable by any script on the page, so one XSS bug is a stolen 30-day session.\n\nAn \`httpOnly\` cookie is not readable by JavaScript at all. The short-lived access token stays in memory and dies with the tab.\n\nRotating it on every use means a stolen one is good for exactly one request — and the theft shows up as the real user being signed out.`,
    color: 'red',
    labels: ['Ideas', 'Work'],
  },
  {
    title: 'Weekend',
    body: 'Cycle to the lake if the weather holds. Otherwise: the second half of the Kleppmann chapter on replication.',
    color: 'orange',
    labels: ['Personal'],
  },
  {
    title: 'Interview questions to prepare',
    type: 'checklist',
    items: [
      { text: 'Why Mongoose over the raw driver?', checked: true },
      { text: 'How do you stop one user reading another user\'s note?', checked: true },
      { text: 'Why is search client-side?', checked: false },
      { text: 'What does an optimistic update roll back?', checked: false },
      { text: 'Why snapshots rather than diffs?', checked: false },
    ],
    color: 'pink',
    labels: ['Work'],
  },
  {
    title: 'Conflict handling',
    body: 'Two tabs, one note. The second save is refused with the current version attached, and the editor shows both. Last-write-wins is the version of this feature where somebody quietly loses a paragraph.',
    color: 'brown',
    labels: ['Ideas'],
  },
  {
    title: 'Archived: old API sketch',
    body: 'Superseded by the /api/notes routes. Kept because the versioning idea started here.',
    color: 'gray',
    archived: true,
    labels: ['Ideas'],
  },
  {
    title: 'Old draft, binned',
    body: 'Nothing here survived the rewrite.',
    color: 'default',
    trashedAt: daysAgo(2),
  },
];

/** Shared by the teammate with the demo user, so the shared view is not empty. */
const SHARED_BY_TEAMMATE = {
  title: 'Q3 launch plan',
  body: `Owned by Sara, shared with you as an **editor**.\n\n- [ ] Copy review\n- [ ] Pricing page\n- [ ] Announcement post\n\nEdits from either of us appear on the other's board live.`,
  color: 'teal',
};

async function wipe(user) {
  await Promise.all([
    Note.deleteMany({ owner: user._id }),
    NoteVersion.deleteMany({ owner: user._id }),
    Label.deleteMany({ owner: user._id }),
    NoteShare.deleteMany({ $or: [{ owner: user._id }, { user: user._id }] }),
    Notification.deleteMany({ user: user._id }),
  ]);
  await user.deleteOne();
}

async function makeUser({ name, email, password }) {
  const user = new User({ name, email });
  await user.setPassword(password);
  await user.save();
  return user;
}

async function seed() {
  await connectDb();

  for (const { email } of [DEMO, TEAMMATE]) {
    const existing = await User.findOne({ email });
    if (existing) await wipe(existing);
  }
  console.log('[seed] cleared any previous demo data');

  const demo = await makeUser(DEMO);
  const sara = await makeUser(TEAMMATE);

  const labels = {};
  for (const name of LABELS) {
    labels[name] = await Label.create({ owner: demo._id, name });
  }

  const created = [];
  for (const spec of NOTES) {
    const note = await Note.create({
      owner: demo._id,
      title: spec.title,
      body: spec.body || '',
      type: spec.type || 'note',
      items: spec.items || [],
      color: spec.color || 'default',
      pinned: Boolean(spec.pinned),
      archived: Boolean(spec.archived),
      trashedAt: spec.trashedAt || null,
      remindAt: spec.remindAt || null,
      labels: (spec.labels || []).map((n) => labels[n]._id),
      order: created.length,
      version: 1,
    });
    await Activity.create({ note: note._id, actor: demo._id, action: 'created' });
    created.push(note);
  }

  // One note with a real history, so the version panel and the diff view have
  // something to show on a fresh install.
  const evolving = await Note.create({
    owner: demo._id,
    title: 'Project pitch',
    body: 'A notes app. That is the whole pitch.',
    color: 'default',
    labels: [labels.Ideas._id],
    order: created.length,
    version: 1,
  });
  await Activity.create({ note: evolving._id, actor: demo._id, action: 'created' });

  const drafts = [
    'A notes app that keeps every version, so nothing you wrote is ever one edit away from gone.',
    `**Keep, with a memory.**\n\nEvery edit is snapshotted, every version is one click away, and restoring is itself undoable.\n\nPlus markdown, labels, reminders, sharing and instant search.`,
  ];

  for (const body of drafts) {
    await NoteVersion.create({
      note: evolving._id,
      owner: demo._id,
      author: demo._id,
      version: evolving.version,
      title: evolving.title,
      body: evolving.body,
      type: evolving.type,
      items: [],
      color: evolving.color,
      labels: evolving.labels,
      reason: 'edit',
    });
    await Activity.create({ note: evolving._id, actor: demo._id, action: 'edited' });
    evolving.body = body;
    evolving.version += 1;
    await evolving.save();
  }

  // A note the demo user owns and has shared out.
  const sharedOut = created.find((n) => n.title === 'Deploy checklist');
  await NoteShare.create({
    note: sharedOut._id, owner: demo._id, user: sara._id, role: 'editor',
  });
  await Activity.create({
    note: sharedOut._id, actor: demo._id, action: 'shared',
    meta: { email: sara.email, role: 'editor' },
  });

  // A note Sara owns and has shared in — with an edit from her, so the
  // activity log and the version author are somebody else.
  const sharedIn = await Note.create({
    owner: sara._id,
    title: SHARED_BY_TEAMMATE.title,
    body: 'Owned by Sara. First draft.',
    color: SHARED_BY_TEAMMATE.color,
    version: 1,
  });
  await Activity.create({ note: sharedIn._id, actor: sara._id, action: 'created' });
  await NoteShare.create({
    note: sharedIn._id, owner: sara._id, user: demo._id, role: 'editor',
  });
  await NoteVersion.create({
    note: sharedIn._id,
    owner: sara._id,
    author: sara._id,
    version: 1,
    title: sharedIn.title,
    body: sharedIn.body,
    type: 'note',
    items: [],
    color: sharedIn.color,
    labels: [],
    reason: 'edit',
  });
  sharedIn.body = SHARED_BY_TEAMMATE.body;
  sharedIn.version = 2;
  await sharedIn.save();
  await Activity.create({ note: sharedIn._id, actor: sara._id, action: 'edited' });

  await Notification.create({
    user: demo._id,
    type: 'shared_with_you',
    note: sharedIn._id,
    title: 'Sara Ahmed shared a note with you',
    body: SHARED_BY_TEAMMATE.title,
  });

  const counts = {
    notes: await Note.countDocuments({ owner: demo._id }),
    labels: await Label.countDocuments({ owner: demo._id }),
    versions: await NoteVersion.countDocuments({ owner: demo._id }),
    shares: await NoteShare.countDocuments({ $or: [{ owner: demo._id }, { user: demo._id }] }),
  };

  console.log(`[seed] ${DEMO.email} / ${DEMO.password}`);
  console.log(`[seed] ${TEAMMATE.email} / ${TEAMMATE.password}  (the collaborator)`);
  console.log(
    `[seed] ${counts.notes} notes, ${counts.labels} labels, ` +
    `${counts.versions} versions, ${counts.shares} shares`
  );

  await mongoose.connection.close();
  await disconnectDb();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
