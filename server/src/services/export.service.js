import { Note } from '../models/Note.js';
import { Label } from '../models/Label.js';

/**
 * Take your notes with you.
 *
 * A notes app that cannot hand back what you wrote is a place your writing is
 * trapped. JSON is the faithful copy — every field, restorable. Markdown is
 * the readable one, which is what someone moving to another tool actually
 * wants, and it works because the body was stored as markdown all along.
 */

export async function exportJson(userId) {
  const [notes, labels] = await Promise.all([
    Note.find({ owner: userId }).populate('labels').sort({ createdAt: 1 }),
    Label.find({ owner: userId }).sort({ name: 1 }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: 'keep-notes/v1',
    labels: labels.map((l) => ({ name: l.name, color: l.color })),
    notes: notes.map((n) => {
      const json = n.toJSON();
      // The owner is whoever is doing the exporting; repeating their id on
      // every row is noise in a file meant to be read.
      delete json.owner;
      return json;
    }),
  };
}

function frontMatter(note) {
  const lines = ['---', `title: ${JSON.stringify(note.title || 'Untitled')}`];
  lines.push(`created: ${new Date(note.createdAt).toISOString()}`);
  lines.push(`updated: ${new Date(note.updatedAt).toISOString()}`);
  if (note.labels.length) lines.push(`labels: [${note.labels.map((l) => l.name).join(', ')}]`);
  if (note.color !== 'default') lines.push(`color: ${note.color}`);
  if (note.pinned) lines.push('pinned: true');
  if (note.archived) lines.push('archived: true');
  if (note.remindAt) lines.push(`reminder: ${new Date(note.remindAt).toISOString()}`);
  lines.push(`version: ${note.version}`, '---', '');
  return lines.join('\n');
}

export async function exportMarkdown(userId) {
  const notes = await Note.find({ owner: userId, trashedAt: null })
    .populate('labels')
    .sort({ pinned: -1, updatedAt: -1 });

  const documents = notes.map((n) => {
    const note = n.toJSON();
    let body = frontMatter(note);
    body += `# ${note.title || 'Untitled'}\n\n`;

    if (note.type === 'checklist') {
      // GitHub-flavoured task list, so the checkboxes survive the move.
      body += note.items.map((i) => `- [${i.checked ? 'x' : ' '}] ${i.text}`).join('\n');
    } else {
      body += note.body;
    }

    if (note.attachments.length) {
      body += `\n\n${note.attachments.map((a) => `![${a.filename}](${a.url})`).join('\n')}`;
    }
    return body.trimEnd();
  });

  return documents.join('\n\n---\n\n');
}
