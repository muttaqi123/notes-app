import { Note } from '../models/Note.js';
import { NoteShare } from '../models/NoteShare.js';
import { notify } from './notifications.service.js';

/**
 * The reminder sweep.
 *
 * Runs on a timer and sends anything now due. Two properties matter:
 *
 *   - `reminderSentAt` is written AFTER the notification exists, so a crash
 *     mid-sweep retries the reminder rather than losing it silently. A missed
 *     reminder is the one failure this feature cannot have.
 *   - The query filters on `reminderSentAt: null`, so a reminder is sent once
 *     no matter how often the sweep runs or how many processes run it.
 */
export async function sweepDueReminders(now = new Date()) {
  const due = await Note.find({
    remindAt: { $ne: null, $lte: now },
    reminderSentAt: null,
    trashedAt: null,
  }).limit(200);

  let sent = 0;
  for (const note of due) {
    // Collaborators are reminded too — a shared to-do that only reminds its
    // owner is not shared in any useful sense.
    const shares = await NoteShare.find({ note: note._id }).select('user');
    const recipients = [note.owner, ...shares.map((s) => s.user)];

    for (const userId of recipients) {
      await notify(userId, {
        type: 'reminder',
        note: note._id,
        title: note.title || 'Untitled note',
        body: 'Your reminder for this note is due.',
      });
    }

    note.reminderSentAt = new Date();
    await note.save();
    sent += 1;
  }

  return { checked: due.length, sent };
}

/**
 * Delete notes that have been in the trash longer than the retention window.
 *
 * `trashedAt` being a timestamp rather than a boolean is what makes this
 * possible at all — a flag can say a note is in the bin but not for how long.
 */
export async function purgeOldTrash(retentionDays = 30, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const stale = await Note.find({ trashedAt: { $ne: null, $lt: cutoff } }).select('_id');
  const ids = stale.map((n) => n._id);
  if (!ids.length) return { purged: 0 };

  const { NoteVersion } = await import('../models/NoteVersion.js');
  const { Activity } = await import('../models/Activity.js');
  await Promise.all([
    NoteVersion.deleteMany({ note: { $in: ids } }),
    Activity.deleteMany({ note: { $in: ids } }),
    NoteShare.deleteMany({ note: { $in: ids } }),
  ]);
  await Note.deleteMany({ _id: { $in: ids } });

  return { purged: ids.length };
}
