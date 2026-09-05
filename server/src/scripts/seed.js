import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Label } from '../models/Label.js';
import { Note } from '../models/Note.js';
import { NoteVersion } from '../models/NoteVersion.js';

/**
 * Fills a demo account with notes worth looking at — every feature the app has
 * appears at least once, including a note with real version history, so the
 * history panel is not empty on a fresh install.
 *
 *   npm run seed          # into whatever MONGODB_URI points at
 *
 * Safe to re-run: it deletes the demo user's own data first and touches
 * nothing else.
 */

const DEMO = { name: 'Demo User', email: 'demo@keepnotes.app', password: 'demo-password-123' };

const LABELS = ['Work', 'Personal', 'Ideas', 'Reading'];

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
    title: 'Sprint 14 — standup notes',
    body: `**Done**\n- auth rotation merged\n- masonry layout on mobile\n\n**Next**\n- version diffing\n- empty-state copy`,
    color: 'blue',
    labels: ['Work'],
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
    body: `1. *Designing Data-Intensive Applications* — Kleppmann\n2. *The Pragmatic Programmer*\n3. *Refactoring UI* — for the parts of this app that still look like a form`,
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
    ],
    color: 'teal',
    labels: ['Work'],
  },
  {
    title: 'Why the refresh token is a cookie',
    body: `A token in \`localStorage\` is readable by any script on the page, so one XSS bug is a stolen 30-day session.\n\nAn \`httpOnly\` cookie is not readable by JavaScript at all. The short-lived access token stays in memory and dies with the tab.`,
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
    ],
    color: 'pink',
    labels: ['Work'],
  },
  {
    title: 'Archived: old API sketch',
    body: 'Superseded by the /api/notes routes. Kept because the versioning idea started here.',
    color: 'gray',
    archived: true,
    labels: ['Ideas'],
  },
];

async function seed() {
  await connectDb();

  const existing = await User.findOne({ email: DEMO.email });
  if (existing) {
    await Promise.all([
      Note.deleteMany({ owner: existing._id }),
      NoteVersion.deleteMany({ owner: existing._id }),
      Label.deleteMany({ owner: existing._id }),
    ]);
    await existing.deleteOne();
    console.log('[seed] cleared the previous demo account');
  }

  const user = new User({ name: DEMO.name, email: DEMO.email });
  await user.setPassword(DEMO.password);
  await user.save();

  const labels = {};
  for (const name of LABELS) {
    labels[name] = await Label.create({ owner: user._id, name });
  }

  for (const spec of NOTES) {
    await Note.create({
      owner: user._id,
      title: spec.title,
      body: spec.body || '',
      type: spec.type || 'note',
      items: spec.items || [],
      color: spec.color || 'default',
      pinned: Boolean(spec.pinned),
      archived: Boolean(spec.archived),
      labels: (spec.labels || []).map((n) => labels[n]._id),
      version: 1,
    });
  }

  // One note with a real history, so the version panel has something to show.
  const evolving = await Note.create({
    owner: user._id,
    title: 'Project pitch',
    body: 'A notes app. That is the whole pitch.',
    color: 'default',
    labels: [labels.Ideas._id],
    version: 1,
  });

  const drafts = [
    'A notes app that keeps every version, so nothing you wrote is ever one edit away from gone.',
    `**Keep, with a memory.**\n\nEvery edit is snapshotted, every version is one click away, and restoring is itself undoable.\n\nPlus markdown, labels and instant search.`,
  ];

  for (const body of drafts) {
    await NoteVersion.create({
      note: evolving._id,
      owner: user._id,
      version: evolving.version,
      title: evolving.title,
      body: evolving.body,
      type: evolving.type,
      items: [],
      color: evolving.color,
      labels: evolving.labels,
      reason: 'edit',
    });
    evolving.body = body;
    evolving.version += 1;
    await evolving.save();
  }

  const counts = {
    notes: await Note.countDocuments({ owner: user._id }),
    labels: await Label.countDocuments({ owner: user._id }),
    versions: await NoteVersion.countDocuments({ owner: user._id }),
  };

  console.log(`[seed] ${DEMO.email} / ${DEMO.password}`);
  console.log(`[seed] ${counts.notes} notes, ${counts.labels} labels, ${counts.versions} versions`);

  await mongoose.connection.close();
  await disconnectDb();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
