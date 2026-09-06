import { forwardRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import Avatar from './Avatar.jsx';
import {
  MenuIcon, SearchIcon, CloseIcon, NoteIcon, ArchiveIcon, TrashIcon, LabelIcon,
  LogoutIcon, ChartIcon, SettingsIcon, SunIcon, MoonIcon, UsersIcon, ClockIcon,
  CommandIcon,
} from './Icons.jsx';

function NavItem({ to, icon: Icon, children, end = false, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-4 rounded-r-full py-2.5 pl-6 pr-4 text-sm transition-colors ${
          isActive ? 'bg-selected font-medium text-ink' : 'text-ink hover:bg-subtle'
        }`
      }
    >
      <Icon width={20} height={20} className="shrink-0" />
      <span className="truncate">{children}</span>
      {badge > 0 && (
        <span className="ml-auto rounded-full bg-accent/15 px-1.5 text-[11px] text-accent">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/**
 * The app frame: a fixed top bar with search, and a nav rail that slides away
 * on a phone. Everything chrome-shaped lives here so the pages underneath are
 * only about their own content.
 */
const Shell = forwardRef(function Shell(
  {
    query, setQuery, labels = [], children, onManageLabels,
    notifications, onOpenPalette, connected, onOpenNoteById,
  },
  searchRef
) {
  const [navOpen, setNavOpen] = useState(false);
  const { user, logout } = useAuth();
  const { isDark, setPreference } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-app px-2 sm:px-4">
        <button
          type="button"
          className="icon-btn h-10 w-10"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen((o) => !o)}
        >
          <MenuIcon width={22} height={22} />
        </button>

        <div className="flex items-center gap-2 pr-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#fbbc04] text-[#3c4043]">
            <NoteIcon width={18} height={18} />
          </span>
          <span className="hidden text-[22px] leading-none text-muted sm:block">Keep Notes</span>
        </div>

        <div className="mx-2 flex h-12 max-w-2xl flex-1 items-center gap-2 rounded-lg bg-subtle px-4 transition-shadow focus-within:bg-surface focus-within:shadow-card">
          <SearchIcon width={20} height={20} className="shrink-0 text-muted" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your notes"
            aria-label="Search your notes"
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
          {query && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
              <CloseIcon width={18} height={18} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="icon-btn hidden h-10 w-10 sm:grid"
            title="Command palette (⌘K)"
            aria-label="Open the command palette"
            onClick={onOpenPalette}
          >
            <CommandIcon width={18} height={18} />
          </button>

          <button
            type="button"
            className="icon-btn h-10 w-10"
            title={isDark ? 'Switch to light' : 'Switch to dark'}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setPreference(isDark ? 'light' : 'dark')}
          >
            {isDark ? <SunIcon width={20} height={20} /> : <MoonIcon width={20} height={20} />}
          </button>

          <NotificationCenter
            notifications={notifications.notifications}
            unread={notifications.unread}
            onMarkRead={notifications.markRead}
            onMarkAllRead={notifications.markAllRead}
            onClear={notifications.clear}
            onOpenNote={onOpenNoteById}
          />

          {/* A quiet dot rather than a banner: a healthy connection is the
              normal case and should not be announced. */}
          <span
            className={`hidden h-2 w-2 rounded-full sm:block ${
              connected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            title={connected ? 'Live updates connected' : 'Reconnecting…'}
          />

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="ml-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={`${user?.name} · ${user?.email}`}
            aria-label="Account settings"
          >
            <Avatar user={user} size={32} title={`${user?.name} · ${user?.email}`} />
          </button>

          <button
            type="button"
            className="icon-btn h-10 w-10"
            title="Sign out"
            aria-label="Sign out"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <LogoutIcon width={20} height={20} />
          </button>
        </div>
      </header>

      <div className="flex">
        {navOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setNavOpen(false)}
          />
        )}

        <nav
          className={`fixed top-16 z-20 h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto bg-app pb-6 pt-2 transition-transform md:sticky md:translate-x-0 ${
            navOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={() => setNavOpen(false)}
        >
          <NavItem to="/" icon={NoteIcon} end>Notes</NavItem>
          <NavItem to="/reminders" icon={ClockIcon}>Reminders</NavItem>
          <NavItem to="/shared" icon={UsersIcon}>Shared with me</NavItem>
          <NavItem to="/archive" icon={ArchiveIcon}>Archive</NavItem>
          <NavItem to="/trash" icon={TrashIcon}>Trash</NavItem>

          <p className="mt-4 px-6 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Labels
          </p>
          {labels.length === 0 && (
            <p className="px-6 py-1 text-xs text-faint">No labels yet — add one from a note.</p>
          )}
          {labels.map((label) => (
            <NavItem key={label.id} to={`/label/${label.id}`} icon={LabelIcon}>
              {label.name}
            </NavItem>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onManageLabels();
            }}
            className="mt-1 flex w-full items-center gap-4 rounded-r-full py-2.5 pl-6 pr-4 text-sm text-ink hover:bg-subtle"
          >
            <LabelIcon width={20} height={20} /> Edit labels
          </button>

          <div className="mt-4 border-t border-line pt-2">
            <NavItem to="/insights" icon={ChartIcon}>Insights</NavItem>
            <NavItem to="/settings" icon={SettingsIcon}>Settings</NavItem>
          </div>
        </nav>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
});

export default Shell;
