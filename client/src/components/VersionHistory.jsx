import { useEffect, useMemo, useState } from 'react';
import { diffWords } from 'diff';
import { api } from '../api/client.js';
import { renderMarkdown } from '../lib/markdown.js';
import Avatar from './Avatar.jsx';
import { CloseIcon, RestoreIcon } from './Icons.jsx';

function when(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const asText = (v) =>
  v.type === 'checklist'
    ? (v.items || []).map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n')
    : v.body || '';

/**
 * A word-level diff between a past version and what the note says now.
 *
 * Word-level rather than line-level because notes are prose: a line diff of a
 * reworded paragraph marks the whole paragraph changed and shows you nothing.
 */
function Diff({ before, after }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <ins key={i} className="bg-emerald-500/20 text-emerald-800 no-underline dark:text-emerald-300">
              {part.value}
            </ins>
          );
        }
        if (part.removed) {
          return (
            <del key={i} className="bg-red-500/20 text-red-800 dark:text-red-300">
              {part.value}
            </del>
          );
        }
        return <span key={i} className="opacity-70">{part.value}</span>;
      })}
    </p>
  );
}

/**
 * The feature Google Keep does not have: every past state of a note, what
 * changed between then and now, and a one-click way back. Restoring is itself
 * recorded, so the newer text is never the price of looking at the older one.
 */
export default function VersionHistory({ note, onClose, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('diff');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listVersions(note.id)
      .then(({ versions: found }) => {
        if (cancelled) return;
        setVersions(found);
        setSelected(found[0] || null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  const restore = async () => {
    if (!selected || restoring) return;
    setRestoring(true);
    try {
      const { note: restored } = await api.restoreVersion(note.id, selected.version);
      onRestored(restored);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex max-h-[70vh] flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-medium">Version history</h2>
        <span className="truncate text-xs text-muted">
          {note.title || 'Untitled'} · now at v{note.version}
        </span>
        <button type="button" className="icon-btn ml-auto" onClick={onClose} aria-label="Back to the note">
          <CloseIcon width={18} height={18} />
        </button>
      </header>

      {loading && (
        <div className="space-y-2 p-4">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-20" />
        </div>
      )}
      {error && <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && versions.length === 0 && (
        <p className="p-6 text-sm text-muted">
          This note has not been edited since it was written, so there is nothing to compare against yet.
        </p>
      )}

      {versions.length > 0 && (
        <div className="grid min-h-0 flex-1 grid-cols-[11rem_1fr] divide-x divide-line">
          <ul className="overflow-y-auto py-2">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelected(v)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-subtle ${
                    selected?.id === v.id ? 'bg-subtle font-medium' : ''
                  }`}
                >
                  {v.author && <Avatar user={v.author} size={20} title={v.author.name} />}
                  <span className="min-w-0">
                    <span className="block">v{v.version}</span>
                    <span className="block truncate text-[11px] text-muted">{when(v.createdAt)}</span>
                    {v.reason === 'restore' && (
                      <span className="block text-[10px] text-faint">before a restore</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
              {['diff', 'full'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    mode === m ? 'bg-subtle font-medium text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {m === 'diff' ? 'Changes since' : 'That version'}
                </button>
              ))}
              {selected?.author && (
                <span className="ml-auto truncate text-[11px] text-faint">
                  replaced by {selected.author.name}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {selected && mode === 'diff' && (
                <Diff before={asText(selected)} after={asText(note)} />
              )}
              {selected && mode === 'full' && (
                <>
                  <h3 className="text-base font-medium">{selected.title || 'Untitled'}</h3>
                  {selected.type === 'checklist' ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {selected.items.map((item, i) => (
                        <li key={i} className={item.checked ? 'text-muted line-through' : ''}>
                          {item.checked ? '☑' : '☐'} {item.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div
                      className="md mt-2"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.body) }}
                    />
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-line px-4 py-2">
              <p className="text-[11px] text-muted">
                Restoring keeps the current text as a new version, so this is undoable.
              </p>
              <button
                type="button"
                onClick={restore}
                disabled={restoring}
                className="btn-primary ml-auto shrink-0 px-3 py-1.5 text-xs"
              >
                <RestoreIcon width={14} height={14} />
                {restoring ? 'Restoring…' : `Restore v${selected?.version ?? ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
