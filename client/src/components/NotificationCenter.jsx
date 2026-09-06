import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Popover } from './Menus.jsx';
import { BellIcon, ClockIcon, UsersIcon, AlertIcon } from './Icons.jsx';

const ICONS = {
  reminder: ClockIcon,
  shared_with_you: UsersIcon,
  share_revoked: AlertIcon,
  note_edited: AlertIcon,
};

function ago(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationCenter({ notifications, unread, onMarkRead, onMarkAllRead, onClear, onOpenNote }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="icon-btn h-10 w-10"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon width={20} height={20} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-1 top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-80 p-0">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={onMarkAllRead} className="ml-auto text-xs text-accent hover:underline">
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">Nothing yet.</p>
          )}
          {notifications.map((n) => {
            const Icon = ICONS[n.type] || BellIcon;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) onMarkRead(n.id);
                  if (n.noteId) {
                    onOpenNote(n.noteId);
                    setOpen(false);
                  }
                }}
                className={`flex w-full gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-subtle ${
                  n.read ? '' : 'bg-accent/5'
                }`}
              >
                <Icon width={16} height={16} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-faint">{ago(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>

        {notifications.length > 0 && (
          <div className="border-t border-line px-3 py-2">
            <button type="button" onClick={onClear} className="text-xs text-muted hover:text-ink hover:underline">
              Clear all
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}
