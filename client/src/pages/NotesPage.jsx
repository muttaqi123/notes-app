import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNotes } from '../hooks/useNotes.js';
import Shell from '../components/Shell.jsx';
import Composer from '../components/Composer.jsx';
import NoteCard from '../components/NoteCard.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import LabelManager from '../components/LabelManager.jsx';
import { NoteIcon, ArchiveIcon, TrashIcon, LabelIcon } from '../components/Icons.jsx';

function Masonry({ children }) {
  return (
    <div className="masonry columns-1 sm:columns-2 lg:columns-3 xl:columns-4">{children}</div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-6">
      {title && (
        <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-[#5f6368]">
          {title}
        </h2>
      )}
      <Masonry>{children}</Masonry>
    </section>
  );
}

function Empty({ icon: Icon, children }) {
  return (
    <div className="grid place-items-center py-24 text-center text-[#80868b]">
      <Icon width={96} height={96} strokeWidth={1} className="opacity-25" />
      <p className="mt-4 text-lg">{children}</p>
    </div>
  );
}

const EMPTY_COPY = {
  active: { icon: NoteIcon, text: 'Notes you add appear here' },
  archive: { icon: ArchiveIcon, text: 'Your archived notes appear here' },
  trash: { icon: TrashIcon, text: 'No notes in the trash' },
  label: { icon: LabelIcon, text: 'No notes with this label yet' },
};

export default function NotesPage({ view = 'active' }) {
  const { labelId } = useParams();
  const effectiveView = labelId ? 'active' : view;
  const {
    pinned, others, notes, labels, loading, error, query, setQuery, actions,
  } = useNotes({ view: effectiveView, labelId });

  const [editing, setEditing] = useState(null);
  const [managingLabels, setManagingLabels] = useState(false);

  const label = labels.find((l) => l.id === labelId);
  const empty = EMPTY_COPY[labelId ? 'label' : view];
  const showComposer = view === 'active' && !labelId;

  const openEditor = (note, startOnHistory = false) => setEditing({ note, startOnHistory });

  return (
    <Shell
      query={query}
      setQuery={setQuery}
      labels={labels}
      onManageLabels={() => setManagingLabels(true)}
    >
      {error && (
        <div className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={actions.dismissError} className="underline">Dismiss</button>
        </div>
      )}

      {showComposer && (
        <Composer
          labels={labels}
          onCreate={actions.create}
          onCreateLabel={actions.createLabel}
        />
      )}

      {labelId && (
        <h1 className="mb-4 px-1 text-lg font-medium text-[#3c4043]">{label?.name ?? 'Label'}</h1>
      )}

      {view === 'trash' && notes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-[#f1f3f4] px-4 py-2 text-xs text-[#5f6368]">
          <span>Notes in the trash are deleted for good when you empty it.</span>
          <button
            type="button"
            onClick={actions.emptyTrash}
            className="ml-auto font-medium text-[#1a73e8] hover:underline"
          >
            Empty trash
          </button>
        </div>
      )}

      {loading && <p className="py-16 text-center text-sm text-[#5f6368]">Loading your notes…</p>}

      {!loading && notes.length === 0 && (
        <Empty icon={empty.icon}>
          {query ? `No notes match “${query}”` : empty.text}
        </Empty>
      )}

      {!loading && pinned.length > 0 && (
        <Section title={others.length > 0 ? 'Pinned' : null}>
          {pinned.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              view={view}
              actions={actions}
              onOpen={openEditor}
              onHistory={(n) => openEditor(n, true)}
            />
          ))}
        </Section>
      )}

      {!loading && others.length > 0 && (
        <Section title={pinned.length > 0 ? 'Others' : null}>
          {others.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              view={view}
              actions={actions}
              onOpen={openEditor}
              onHistory={(n) => openEditor(n, true)}
            />
          ))}
        </Section>
      )}

      {editing && (
        <NoteEditor
          key={editing.note.id}
          note={editing.note}
          labels={labels}
          actions={actions}
          startOnHistory={editing.startOnHistory}
          onClose={() => setEditing(null)}
        />
      )}

      {managingLabels && (
        <LabelManager
          labels={labels}
          actions={actions}
          onClose={() => setManagingLabels(false)}
        />
      )}
    </Shell>
  );
}
