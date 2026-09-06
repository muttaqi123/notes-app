import Modal from './Modal.jsx';
import { AlertIcon } from './Icons.jsx';

const asText = (n) =>
  n.type === 'checklist'
    ? (n.items || []).map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n')
    : n.body || '';

/**
 * What happens when two people save the same note.
 *
 * The alternative — last write wins — is not an error the user ever sees, and
 * that is exactly the problem: someone's paragraph disappears and nobody finds
 * out until much later. Showing both versions and asking is the only honest
 * option, and nothing is lost either way because the version history keeps
 * whichever one is not chosen.
 */
export default function ConflictDialog({ conflict, onClose, onKeepMine, onKeepTheirs }) {
  const { theirs, mine } = conflict;

  return (
    <Modal open onClose={onClose} label="This note changed while you were editing" width="max-w-3xl">
      <div className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <AlertIcon width={20} height={20} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <h2 className="text-base font-medium">This note changed while you were writing</h2>
            <p className="mt-1 text-sm text-muted">
              Someone saved a new version before you did. Nothing is lost — whichever you
              choose, the other stays in the version history.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-lg border border-line p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Saved version · v{theirs.version}
            </h3>
            <p className="mb-1 truncate text-sm font-medium">{theirs.title || 'Untitled'}</p>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-sans text-xs text-muted">
              {asText(theirs) || '(empty)'}
            </pre>
          </section>

          <section className="rounded-lg border-2 border-accent p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
              Your version
            </h3>
            <p className="mb-1 truncate text-sm font-medium">{mine.title || 'Untitled'}</p>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-sans text-xs text-muted">
              {asText(mine) || '(empty)'}
            </pre>
          </section>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Keep editing
          </button>
          <button type="button" onClick={onKeepTheirs} className="btn-ghost">
            Discard mine
          </button>
          <button type="button" onClick={onKeepMine} className="btn-primary">
            Save mine over it
          </button>
        </div>
      </div>
    </Modal>
  );
}
