import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { renderMarkdown } from '../lib/markdown.js';
import { CloseIcon, RestoreIcon } from './Icons.jsx';

function when(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * The feature Google Keep does not have: every past state of a note, and a
 * one-click way back to any of them. Restoring is itself recorded, so the
 * newer text is never the price of looking at the older one.
 */
export default function VersionHistory({ note, onClose, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listVersions(note.id)
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
      <header className="flex items-center gap-2 border-b border-black/10 px-4 py-3">
        <h2 className="text-sm font-medium">Version history</h2>
        <span className="text-xs text-black/50">
          {note.title || 'Untitled'} · now at v{note.version}
        </span>
        <button type="button" className="icon-btn ml-auto" onClick={onClose} aria-label="Back to the note">
          <CloseIcon width={18} height={18} />
        </button>
      </header>

      {loading && <p className="p-6 text-sm text-black/60">Loading history…</p>}
      {error && <p className="p-6 text-sm text-red-700">{error}</p>}

      {!loading && !error && versions.length === 0 && (
        <p className="p-6 text-sm text-black/60">
          This note has not been edited since it was written, so there is nothing to compare against yet.
        </p>
      )}

      {versions.length > 0 && (
        <div className="grid min-h-0 flex-1 grid-cols-[11rem_1fr] divide-x divide-black/10">
          <ul className="overflow-y-auto py-2">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelected(v)}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-black/5 ${
                    selected?.id === v.id ? 'bg-black/10 font-medium' : ''
                  }`}
                >
                  <span className="block">v{v.version}</span>
                  <span className="block text-[11px] text-black/55">{when(v.createdAt)}</span>
                  {v.reason === 'restore' && (
                    <span className="mt-0.5 inline-block text-[10px] text-black/45">
                      before a restore
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              {selected && (
                <>
                  <h3 className="text-base font-medium">{selected.title || 'Untitled'}</h3>
                  {selected.type === 'checklist' ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {selected.items.map((item, i) => (
                        <li key={i} className={item.checked ? 'text-black/45 line-through' : ''}>
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
            <div className="flex items-center gap-2 border-t border-black/10 px-4 py-2">
              <p className="text-[11px] text-black/50">
                Restoring keeps the current text as a new version, so this is undoable.
              </p>
              <button
                type="button"
                onClick={restore}
                disabled={restoring}
                className="ml-auto flex items-center gap-1.5 rounded bg-[#3c4043] px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
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
