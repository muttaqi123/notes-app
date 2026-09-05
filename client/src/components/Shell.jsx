import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  MenuIcon, SearchIcon, CloseIcon, NoteIcon, ArchiveIcon, TrashIcon, LabelIcon, LogoutIcon,
} from './Icons.jsx';

function NavItem({ to, icon: Icon, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-4 rounded-r-full py-2.5 pl-6 pr-4 text-sm transition ${
          isActive ? 'bg-[#feefc3] font-medium text-[#202124]' : 'text-[#3c4043] hover:bg-black/[.06]'
        }`
      }
    >
      <Icon width={20} height={20} className="shrink-0" />
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

/**
 * The app frame: a fixed top bar with search, and a nav rail that collapses to
 * icons on a laptop and slides away entirely on a phone.
 */
export default function Shell({ query, setQuery, labels, children, onManageLabels }) {
  const [navOpen, setNavOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-black/10 bg-white px-2 sm:px-4">
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
          <span className="hidden text-[22px] leading-none text-[#5f6368] sm:block">Keep Notes</span>
        </div>

        <div className="mx-2 flex h-12 max-w-2xl flex-1 items-center gap-2 rounded-lg bg-[#f1f3f4] px-4 focus-within:bg-white focus-within:shadow-card">
          <SearchIcon width={20} height={20} className="shrink-0 text-[#5f6368]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your notes"
            aria-label="Search your notes"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-[#5f6368]"
          />
          {query && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
              <CloseIcon width={18} height={18} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-[#5f6368] md:block">{user?.email}</span>
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
            className="fixed inset-0 z-10 bg-black/30 md:hidden"
            onClick={() => setNavOpen(false)}
          />
        )}

        <nav
          className={`fixed top-16 z-10 h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto bg-white pb-6 pt-2 transition-transform md:sticky md:translate-x-0 ${
            navOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <NavItem to="/" icon={NoteIcon} end>Notes</NavItem>
          <NavItem to="/archive" icon={ArchiveIcon}>Archive</NavItem>
          <NavItem to="/trash" icon={TrashIcon}>Trash</NavItem>

          <p className="mt-4 px-6 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[#5f6368]">
            Labels
          </p>
          {labels.length === 0 && (
            <p className="px-6 py-1 text-xs text-[#80868b]">
              No labels yet — add one from a note.
            </p>
          )}
          {labels.map((label) => (
            <NavItem key={label.id} to={`/label/${label.id}`} icon={LabelIcon}>
              {label.name}
            </NavItem>
          ))}
          <button
            type="button"
            onClick={onManageLabels}
            className="mt-1 flex w-full items-center gap-4 rounded-r-full py-2.5 pl-6 pr-4 text-sm text-[#3c4043] hover:bg-black/[.06]"
          >
            <LabelIcon width={20} height={20} /> Edit labels
          </button>
        </nav>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
