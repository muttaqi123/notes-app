import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../api/client.js';
import { colorStyle } from '../lib/colors.js';
import { renderMarkdown } from '../lib/markdown.js';
import { ColorMenu, LabelMenu } from './Menus.jsx';
import ReminderMenu, { formatReminder } from './ReminderMenu.jsx';
import ChecklistEditor from './ChecklistEditor.jsx';
import VersionHistory from './VersionHistory.jsx';
import ActivityPanel from './ActivityPanel.jsx';
import ConflictDialog from './ConflictDialog.jsx';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import {
  PaletteIcon, LabelIcon, ArchiveIcon, UnarchiveIcon, TrashIcon, PinIcon,
  HistoryIcon, MarkdownIcon, CheckboxIcon, NoteIcon, ClockIcon, ImageIcon,
  ShareIcon, UsersIcon, CloseIcon,
} from './Icons.jsx';

/**
 * The open note.
 *
 * It saves on close rather than on every keystroke: one version per editing
 * session is a history a person can read, where one version per keystroke is
 * a history nobody can. It sends a PATCH only when something actually changed,
 * so opening a note to read it does not create a version of it.
 *
 * `expectedVersion` goes with every save. If someone else edited the note in
 * the meantime the server refuses and hands back what the note now says, and
 * the conflict dialog shows both — rather than one person's work quietly
 * replacing the other's.
 */
export default function NoteEditor({
  note, labels, actions, onClose, onShare, startOn = 'editor', socket, currentUserId,
}) {
  const [draft, setDraft] = useState(() => ({
    title: note.title,
    body: note.body,
    type: note.type,
    items: note.items.length ? note.items : [{ text: '', checked: false }],
    color: note.color,
    pinned: note.pinned,
    remindAt: note.remindAt,
    labels: note.labels.map((l) => l.id),
  }));
  const [panel, setPanel] = useState(startOn);
  const [preview, setPreview] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [viewers, setViewers] = useState([]);
  const [live, setLive] = useState(note);
  const fileRef = useRef(null);

  const readOnly = Boolean(note.owner?.id) && note.owner.id !== currentUserId && note.myRole === 'viewer';

  /* Presence: tell the server this note is open, and leave when it closes. */
  useEffect(() => {
    socket?.openNote?.(note.id, (res) => {
      if (res?.ok) setViewers(res.viewers.filter((v) => v.id !== currentUserId));
    });
    return () => socket?.closeNote?.(note.id);
  }, [note.id, socket, currentUserId]);

  useEffect(() => {
    const s = socket?.socket?.current;
    if (!s) return undefined;
    const onPresence = ({ noteId, viewers: list }) => {
      if (noteId === note.id) setViewers(list.filter((v) => v.id !== currentUserId));
    };
    // Someone else's save while this note is open: track it so the version
    // number sent on save is the current one, not the one loaded minutes ago.
    const onChanged = ({ note: updated }) => {
      if (updated.id === note.id) setLive(updated);
    };
    s.on('presence:state', onPresence);
    s.on('note:changed', onChanged);
    return () => {
      s.off('presence:state', onPresence);
      s.off('note:changed', onChanged);
    };
  }, [socket, note.id, currentUserId]);

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
      draft.remindAt !== note.remindAt ||
      !sameItems ||
      !sameLabels
    );
  };

  const save = async () => {
    if (saving || readOnly) {
      onClose();
      return;
    }
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
        expectedVersion: live.version,
      });
      onClose();
    } catch (err) {
      if (err.code === 'version_conflict') {
        setConflict({ theirs: err.payload.current, mine: draft });
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      // Cmd/Ctrl+Enter saves without reaching for the mouse.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { note: updated } = await api.addAttachment(note.id, file);
      actions.mergeNote(updated);
      setLive(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <>
      <Modal open onClose={save} label="Edit note" width="max-w-3xl">
        <div style={colorStyle(draft.color)} className="rounded-xl">
          {panel === 'history' ? (
            <VersionHistory
              note={live}
              onClose={() => setPanel('editor')}
              onRestored={(restored) => {
                setDraft({
                  title: restored.title,
                  body: restored.body,
                  type: restored.type,
                  items: restored.items.length ? restored.items : [{ text: '', checked: false }],
                  color: restored.color,
                  pinned: restored.pinned,
                  remindAt: restored.remindAt,
                  labels: restored.labels.map((l) => l.id),
                });
                setLive(restored);
                actions.mergeNote(restored);
                setPanel('editor');
              }}
            />
          ) : panel === 'activity' ? (
            <ActivityPanel note={live} onClose={() => setPanel('editor')} />
          ) : (
            <div className="p-4">
              {(viewers.length > 0 || readOnly) && (
                <div className="mb-3 flex items-center gap-2 text-xs">
                  {viewers.length > 0 && (
                    <>
                      <span className="flex -space-x-1.5">
                        {viewers.map((v) => <Avatar key={v.id} user={v} size={22} />)}
                      </span>
                      <span className="opacity-70">
                        {viewers.length === 1
                          ? `${viewers[0].name} is here too`
                          : `${viewers.length} others are here`}
                      </span>
                    </>
                  )}
                  {readOnly && (
                    <span className="ml-auto rounded-full bg-black/10 px-2 py-0.5">
                      You can view this note, not edit it
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-start gap-2">
                <input
                  value={draft.title}
                  readOnly={readOnly}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Title"
                  className="w-full bg-transparent text-lg font-medium outline-none placeholder:opacity-40"
                />
                <button
                  type="button"
                  className="icon-btn"
                  disabled={readOnly}
                  title={draft.pinned ? 'Unpin' : 'Pin'}
                  onClick={() => set({ pinned: !draft.pinned })}
                >
                  <PinIcon filled={draft.pinned} width={18} height={18} />
                </button>
              </div>

              {live.attachments?.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {live.attachments.map((a) => (
                    <div key={a.id} className="group/img relative">
                      <img
                        src={assetUrl(a.url)}
                        alt={a.filename}
                        width={a.width}
                        height={a.height}
                        className="h-28 w-full rounded object-cover"
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          aria-label={`Remove ${a.filename}`}
                          onClick={async () => {
                            const { note: updated } = await api.removeAttachment(note.id, a.id);
                            actions.mergeNote(updated);
                            setLive(updated);
                          }}
                          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover/img:opacity-100"
                        >
                          <CloseIcon width={13} height={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 min-h-[10rem]">
                {draft.type === 'checklist' ? (
                  <ChecklistEditor items={draft.items} onChange={(items) => set({ items })} />
                ) : preview ? (
                  <div
                    className="md min-h-[10rem]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.body) }}
                  />
                ) : (
                  <textarea
                    autoFocus
                    readOnly={readOnly}
                    value={draft.body}
                    onChange={(e) => {
                      set({ body: e.target.value });
                      socket?.setTyping?.(note.id, true);
                    }}
                    onBlur={() => socket?.setTyping?.(note.id, false)}
                    placeholder="Write in markdown…"
                    rows={12}
                    className="w-full resize-y bg-transparent font-mono text-sm leading-relaxed outline-none placeholder:opacity-40"
                  />
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1">
                {draft.remindAt && (
                  <span className="chip">
                    <ClockIcon width={11} height={11} /> {formatReminder(draft.remindAt)}
                  </span>
                )}
                {labels.filter((l) => draft.labels.includes(l.id)).map((l) => (
                  <span key={l.id} className="chip">{l.name}</span>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2 text-[11px] opacity-60">
                <span>Version {live.version}</span>
                <span>·</span>
                <span>edited {new Date(live.updatedAt).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => setPanel('activity')}
                  className="underline-offset-2 hover:underline"
                >
                  Activity
                </button>
              </div>

              {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
              {uploading && <p className="mt-2 text-xs opacity-70">Uploading image…</p>}

              <div className="mt-2 flex flex-wrap items-center gap-1">
                <div className="relative">
                  <button type="button" className="icon-btn" disabled={readOnly} title="Change colour" onClick={() => setPaletteOpen((o) => !o)}>
                    <PaletteIcon width={18} height={18} />
                  </button>
                  <ColorMenu
                    open={paletteOpen}
                    onClose={() => setPaletteOpen(false)}
                    value={draft.color}
                    onPick={(color) => set({ color })}
                  />
                </div>

                <div className="relative">
                  <button type="button" className="icon-btn" disabled={readOnly} title="Labels" onClick={() => setLabelsOpen((o) => !o)}>
                    <LabelIcon width={18} height={18} />
                  </button>
                  <LabelMenu
                    open={labelsOpen}
                    onClose={() => setLabelsOpen(false)}
                    labels={labels}
                    selectedIds={draft.labels}
                    onToggle={(id) =>
                      set({
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

                <div className="relative">
                  <button type="button" className="icon-btn" disabled={readOnly} title="Remind me" onClick={() => setReminderOpen((o) => !o)}>
                    <ClockIcon width={18} height={18} />
                  </button>
                  <ReminderMenu
                    open={reminderOpen}
                    onClose={() => setReminderOpen(false)}
                    value={draft.remindAt}
                    onPick={(remindAt) => set({ remindAt })}
                  />
                </div>

                <button type="button" className="icon-btn" disabled={readOnly || uploading} title="Attach an image" onClick={() => fileRef.current?.click()}>
                  <ImageIcon width={18} height={18} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => upload(e.target.files?.[0])}
                />

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
                  disabled={readOnly}
                  title={draft.type === 'checklist' ? 'Switch to a note' : 'Switch to a checklist'}
                  onClick={() => set({ type: draft.type === 'checklist' ? 'note' : 'checklist' })}
                >
                  {draft.type === 'checklist' ? <NoteIcon width={18} height={18} /> : <CheckboxIcon width={18} height={18} />}
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  title={live.version < 2 ? 'No history yet' : 'Version history'}
                  disabled={live.version < 2}
                  onClick={() => setPanel('history')}
                >
                  <HistoryIcon width={18} height={18} />
                </button>

                {!note.owner?.id || note.owner.id === currentUserId ? (
                  <button type="button" className="icon-btn" title="Share" onClick={() => onShare(note)}>
                    <ShareIcon width={18} height={18} />
                  </button>
                ) : (
                  <span className="icon-btn cursor-default" title={`Shared by ${note.owner.name}`}>
                    <UsersIcon width={18} height={18} />
                  </span>
                )}

                <button
                  type="button"
                  className="icon-btn"
                  disabled={readOnly}
                  title={live.archived ? 'Unarchive' : 'Archive'}
                  onClick={async () => {
                    await actions.toggleArchive(live);
                    onClose();
                  }}
                >
                  {live.archived ? <UnarchiveIcon width={18} height={18} /> : <ArchiveIcon width={18} height={18} />}
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  disabled={readOnly}
                  title="Move to trash"
                  onClick={async () => {
                    await actions.trash(live);
                    onClose();
                  }}
                >
                  <TrashIcon width={18} height={18} />
                </button>

                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="ml-auto rounded px-4 py-1.5 text-sm font-medium hover:bg-black/10 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Close'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {conflict && (
        <ConflictDialog
          conflict={conflict}
          onClose={() => setConflict(null)}
          onKeepMine={async () => {
            // Save again against the version we have now been shown, which is
            // a deliberate overwrite rather than an accidental one.
            await actions.update(note.id, {
              ...draft,
              items: draft.type === 'checklist' ? draft.items.filter((i) => i.text.trim()) : [],
              body: draft.type === 'checklist' ? '' : draft.body,
              expectedVersion: conflict.theirs.version,
            });
            setConflict(null);
            onClose();
          }}
          onKeepTheirs={() => {
            actions.mergeNote(conflict.theirs);
            setConflict(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
