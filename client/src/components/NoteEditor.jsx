import { useEffect, useRef, useState } from 'react';
import { colorOf } from '../lib/colors.js';
import { renderMarkdown } from '../lib/markdown.js';
import { ColorMenu, LabelMenu } from './Menus.jsx';
import ChecklistEditor from './ChecklistEditor.jsx';
import VersionHistory from './VersionHistory.jsx';
import {
  PaletteIcon, LabelIcon, ArchiveIcon, UnarchiveIcon, TrashIcon,
  PinIcon, HistoryIcon, MarkdownIcon, CheckboxIcon, NoteIcon,
} from './Icons.jsx';

/**
 * The open note.
 *
 * It saves on close rather than on every keystroke: one version per editing
 * session is a history a person can read, where one version per keystroke is
 * a history nobody can. It sends a PATCH only when something actually changed,
 * so opening a note to read it does not create a version of it.
 */
export default function NoteEditor({ note, labels, actions, onClose, startOnHistory = false }) {
  const [draft, setDraft] = useState(() => ({
    title: note.title,
    body: note.body,
    type: note.type,
    items: note.items.length ? note.items : [{ text: '', checked: false }],
    color: note.color,
    pinned: note.pinned,
    labels: note.labels.map((l) => l.id),
  }));
  const [preview, setPreview] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(startOnHistory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);

  const changed = () => {
    const items = draft.items.filter((i) => i.text.trim());
    const sameItems =
      JSON.stringify(items.map((i) => [i.text, i.checked])) ===
      JSON.stringify(note.items.map((i) => [i.text, i.checked]));
    const sameLabels =
      [...draft.labels].sort().join(',') === note.labels.map((l) => l.id).sort().join(',');
    return (
      draft.title !== note.title ||
      draft.body !== note.body ||
      draft.type !== note.type ||
      draft.color !== note.color ||
      draft.pinned !== note.pinned ||
      !sameItems ||
      !sameLabels
    );
  };

  const save = async () => {
    if (saving) return;
    if (!changed()) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await actions.update(note.id, {
        ...draft,
        items: draft.type === 'checklist' ? draft.items.filter((i) => i.text.trim()) : [],
        body: draft.type === 'checklist' ? '' : draft.body,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !paletteOpen && !labelsOpen) save();
      // Ctrl/Cmd+Enter saves without reaching for the mouse.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const c = colorOf(draft.color);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16 sm:pt-24"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target)) save();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit note"
        className="w-full max-w-2xl rounded-lg border shadow-raised"
        style={{ background: c.bg, borderColor: c.border }}
      >
        {historyOpen ? (
          <VersionHistory
            note={note}
            onClose={() => setHistoryOpen(false)}
            onRestored={(restored) => {
              setDraft({
                title: restored.title,
                body: restored.body,
                type: restored.type,
                items: restored.items.length ? restored.items : [{ text: '', checked: false }],
                color: restored.color,
                pinned: restored.pinned,
                labels: restored.labels.map((l) => l.id),
              });
              setHistoryOpen(false);
              actions.reload();
            }}
          />
        ) : (
          <div className="p-4">
            <div className="flex items-start gap-2">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Title"
                className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-black/40"
              />
              <button
                type="button"
                className="icon-btn"
                title={draft.pinned ? 'Unpin' : 'Pin'}
                onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
              >
                <PinIcon filled={draft.pinned} width={18} height={18} />
              </button>
            </div>

            <div className="mt-3 min-h-[8rem]">
              {draft.type === 'checklist' ? (
                <ChecklistEditor
                  items={draft.items}
                  onChange={(items) => setDraft({ ...draft, items })}
                />
              ) : preview ? (
                <div
                  className="md min-h-[8rem]"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) }}
                />
              ) : (
                <textarea
                  autoFocus
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="Write in markdown…"
                  rows={10}
                  className="w-full resize-y bg-transparent font-mono text-sm leading-relaxed outline-none placeholder:text-black/40"
                />
              )}
            </div>

            {draft.labels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {labels
                  .filter((l) => draft.labels.includes(l.id))
                  .map((l) => (
                    <span key={l.id} className="chip">{l.name}</span>
                  ))}
              </div>
            )}

            <p className="mt-3 text-[11px] text-black/45">
              Version {note.version} · edited {new Date(note.updatedAt).toLocaleString()}
            </p>

            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <div className="relative">
                <button type="button" className="icon-btn" title="Change colour" onClick={() => setPaletteOpen((o) => !o)}>
                  <PaletteIcon width={18} height={18} />
                </button>
                <ColorMenu
                  open={paletteOpen}
                  onClose={() => setPaletteOpen(false)}
                  value={draft.color}
                  onPick={(color) => setDraft({ ...draft, color })}
                />
              </div>

              <div className="relative">
                <button type="button" className="icon-btn" title="Labels" onClick={() => setLabelsOpen((o) => !o)}>
                  <LabelIcon width={18} height={18} />
                </button>
                <LabelMenu
                  open={labelsOpen}
                  onClose={() => setLabelsOpen(false)}
                  labels={labels}
                  selectedIds={draft.labels}
                  onToggle={(id) =>
                    setDraft({
                      ...draft,
                      labels: draft.labels.includes(id)
                        ? draft.labels.filter((l) => l !== id)
                        : [...draft.labels, id],
                    })
                  }
                  onCreate={async (name) => {
                    const label = await actions.createLabel(name);
                    setDraft((d) => ({ ...d, labels: [...d.labels, label.id] }));
                  }}
                />
              </div>

              {draft.type === 'note' && (
                <button
                  type="button"
                  className={`icon-btn ${preview ? 'bg-black/10' : ''}`}
                  title={preview ? 'Edit markdown' : 'Preview markdown'}
                  aria-pressed={preview}
                  onClick={() => setPreview((p) => !p)}
                >
                  <MarkdownIcon width={18} height={18} />
                </button>
              )}

              <button
                type="button"
                className="icon-btn"
                title={draft.type === 'checklist' ? 'Switch to a note' : 'Switch to a checklist'}
                onClick={() =>
                  setDraft({ ...draft, type: draft.type === 'checklist' ? 'note' : 'checklist' })
                }
              >
                {draft.type === 'checklist' ? <NoteIcon width={18} height={18} /> : <CheckboxIcon width={18} height={18} />}
              </button>

              <button
                type="button"
                className="icon-btn"
                title="Version history"
                disabled={note.version < 2}
                onClick={() => setHistoryOpen(true)}
              >
                <HistoryIcon width={18} height={18} className={note.version < 2 ? 'opacity-30' : ''} />
              </button>

              <button
                type="button"
                className="icon-btn"
                title={note.archived ? 'Unarchive' : 'Archive'}
                onClick={async () => {
                  await actions.toggleArchive(note);
                  onClose();
                }}
              >
                {note.archived ? <UnarchiveIcon width={18} height={18} /> : <ArchiveIcon width={18} height={18} />}
              </button>

              <button
                type="button"
                className="icon-btn"
                title="Move to trash"
                onClick={async () => {
                  await actions.trash(note);
                  onClose();
                }}
              >
                <TrashIcon width={18} height={18} />
              </button>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="ml-auto rounded px-4 py-1.5 text-sm font-medium text-[#3c4043] hover:bg-black/10 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
