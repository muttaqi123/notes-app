import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api/client.js';
import { useNotes } from '../hooks/useNotes.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Shell from '../components/Shell.jsx';
import Composer from '../components/Composer.jsx';
import NoteCard from '../components/NoteCard.jsx';
import NoteEditor from '../components/NoteEditor.jsx';
import LabelManager from '../components/LabelManager.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import CommandPalette from '../components/CommandPalette.jsx';
import ShortcutsDialog from '../components/ShortcutsDialog.jsx';
import { NoteIcon, ArchiveIcon, TrashIcon, LabelIcon, UsersIcon, ClockIcon, DragIcon } from '../components/Icons.jsx';

const EMPTY_COPY = {
  active: { icon: NoteIcon, text: 'Notes you add appear here' },
  archive: { icon: ArchiveIcon, text: 'Your archived notes appear here' },
  trash: { icon: TrashIcon, text: 'No notes in the trash' },
  shared: { icon: UsersIcon, text: 'Notes other people share with you appear here' },
  reminders: { icon: ClockIcon, text: 'Notes with a reminder appear here' },
  label: { icon: LabelIcon, text: 'No notes with this label yet' },
};

function Masonry({ children }) {
  return <div className="masonry columns-1 sm:columns-2 lg:columns-3 xl:columns-4">{children}</div>;
}

function Section({ title, children, grid = false }) {
  return (
    <section className="mb-6">
      {title && (
        <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">
          {title}
        </h2>
      )}
      {grid ? <div className="sortable-grid">{children}</div> : <Masonry>{children}</Masonry>}
    </section>
  );
}

function Empty({ icon: Icon, children }) {
  return (
    <div className="grid place-items-center py-24 text-center text-faint">
      <Icon width={96} height={96} strokeWidth={1} className="opacity-25" />
      <p className="mt-4 text-lg">{children}</p>
    </div>
  );
}

function SkeletonBoard() {
  return (
    <Masonry>
      {[220, 150, 280, 180, 240, 160, 200, 130].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h }} />
      ))}
    </Masonry>
  );
}

/** A card that can be dragged. Only used when the manual sort is chosen —
 *  dragging cards in a date-ordered list would be a lie about what happens. */
function SortableCard({ note, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {children(
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${note.title || 'note'}`}
          className="icon-btn cursor-grab opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <DragIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}

export default function NotesPage({ view = 'active' }) {
  const { labelId } = useParams();
  const { user } = useAuth();
  const { isDark, setPreference } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();

  const sort = user?.settings?.sort || 'updated';
  const {
    pinned, others, notes, allNotes, labels, loading, loadingMore, error,
    query, setQuery, actions, connected, socket,
  } = useNotes({ view, labelId, sort });

  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [managingLabels, setManagingLabels] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const composerRef = useRef(null);
  const searchRef = useRef(null);
  const sentinelRef = useRef(null);

  const notifications = useNotifications({
    onIncoming: (n) => toast({ message: n.title, tone: n.type === 'reminder' ? 'default' : 'default' }),
  });

  const label = labels.find((l) => l.id === labelId);
  const empty = EMPTY_COPY[labelId ? 'label' : view];
  const showComposer = view === 'active' && !labelId;
  const canReorder = sort === 'manual' && view === 'active' && !labelId && !query;

  const openEditor = useCallback((note, startOn = 'editor') => setEditing({ note, startOn }), []);

  /** Open a note by id — used by notification clicks, where only the id is known. */
  const openById = useCallback(async (noteId) => {
    const known = allNotes.find((n) => n.id === noteId);
    if (known) return openEditor(known);
    try {
      const { note } = await api.getNote(noteId);
      openEditor(note);
    } catch {
      toast({ message: 'That note is no longer available', tone: 'danger' });
    }
    return undefined;
  }, [allNotes, openEditor, toast]);

  /* Infinite scroll: a sentinel below the board asks for the next page when it
     comes into view, which beats a "load more" button nobody wants to click. */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !actions.hasMore) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && actions.loadMore(),
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [actions]);

  const hotkeys = useMemo(
    () => ({
      'mod+k': () => setPaletteOpen(true),
      '/': () => searchRef.current?.focus(),
      c: () => composerRef.current?.open('note'),
      l: () => composerRef.current?.open('checklist'),
      t: () => setPreference(isDark ? 'light' : 'dark'),
      'shift+?': () => setShortcutsOpen(true),
      'g n': () => navigate('/'),
      'g a': () => navigate('/archive'),
      'g t': () => navigate('/trash'),
      'g s': () => navigate('/shared'),
      'g r': () => navigate('/reminders'),
      'g i': () => navigate('/insights'),
      'g c': () => navigate('/settings'),
    }),
    [navigate, isDark, setPreference]
  );
  useHotkeys(hotkeys, { enabled: !editing && !paletteOpen });

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so clicking a card still
    // opens it rather than nudging it.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ordered = arrayMove(
      others,
      others.findIndex((n) => n.id === active.id),
      others.findIndex((n) => n.id === over.id)
    );
    actions.reorder([...pinned, ...ordered]);
  };

  const cardProps = {
    view, actions, onOpen: openEditor,
    onHistory: (n) => openEditor(n, 'history'),
    onShare: setSharing,
    currentUserId: user?.id,
  };

  /** Trash with an undo, rather than a confirmation nobody reads. */
  const trashWithUndo = async (note) => {
    await actions.trash(note);
    toast({
      message: 'Note moved to the trash',
      actionLabel: 'Undo',
      action: async () => {
        await api.restoreNote(note.id);
        actions.reload();
      },
    });
  };

  const boardActions = { ...actions, trash: trashWithUndo };

  return (
    <Shell
      ref={searchRef}
      query={query}
      setQuery={setQuery}
      labels={labels}
      onManageLabels={() => setManagingLabels(true)}
      notifications={notifications}
      onOpenPalette={() => setPaletteOpen(true)}
      onOpenNoteById={openById}
      connected={connected}
    >
      {error && (
        <div className="mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded border border-red-300 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={actions.dismissError} className="underline">Dismiss</button>
        </div>
      )}

      {showComposer && (
        <Composer
          ref={composerRef}
          labels={labels}
          onCreate={actions.create}
          onCreateLabel={actions.createLabel}
        />
      )}

      {labelId && <h1 className="mb-4 px-1 text-lg font-medium">{label?.name ?? 'Label'}</h1>}

      {view === 'trash' && notes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-subtle px-4 py-2 text-xs text-muted">
          <span>Notes in the trash are deleted for good after 30 days.</span>
          <button
            type="button"
            onClick={actions.emptyTrash}
            className="ml-auto font-medium text-accent hover:underline"
          >
            Empty trash now
          </button>
        </div>
      )}

      {loading && <SkeletonBoard />}

      {!loading && notes.length === 0 && (
        <Empty icon={empty.icon}>{query ? `No notes match “${query}”` : empty.text}</Empty>
      )}

      {!loading && pinned.length > 0 && (
        <Section title={others.length > 0 ? 'Pinned' : null}>
          {pinned.map((note) => (
            <NoteCard key={note.id} note={note} {...cardProps} actions={boardActions} />
          ))}
        </Section>
      )}

      {!loading && others.length > 0 && (
        canReorder ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={others.map((n) => n.id)} strategy={rectSortingStrategy}>
              <Section title={pinned.length > 0 ? 'Others' : null} grid>
                {others.map((note) => (
                  <SortableCard key={note.id} note={note}>
                    {(handle) => (
                      <NoteCard note={note} {...cardProps} actions={boardActions} dragHandle={handle} />
                    )}
                  </SortableCard>
                ))}
              </Section>
            </SortableContext>
          </DndContext>
        ) : (
          <Section title={pinned.length > 0 ? 'Others' : null}>
            {others.map((note) => (
              <NoteCard key={note.id} note={note} {...cardProps} actions={boardActions} />
            ))}
          </Section>
        )
      )}

      <div ref={sentinelRef} className="h-4" />
      {loadingMore && <p className="py-4 text-center text-sm text-muted">Loading more…</p>}

      {editing && (
        <NoteEditor
          key={editing.note.id}
          note={editing.note}
          labels={labels}
          actions={actions}
          socket={socket}
          currentUserId={user?.id}
          startOn={editing.startOn}
          onShare={setSharing}
          onClose={() => setEditing(null)}
        />
      )}

      {sharing && (
        <ShareDialog
          open
          note={sharing}
          onClose={() => setSharing(null)}
          onChanged={actions.reload}
        />
      )}

      {managingLabels && (
        <LabelManager labels={labels} actions={actions} onClose={() => setManagingLabels(false)} />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={allNotes}
        labels={labels}
        onOpenNote={openEditor}
        onCreate={(type) => composerRef.current?.open(type)}
      />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </Shell>
  );
}
