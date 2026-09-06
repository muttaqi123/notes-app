import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api/client.js';
import { useNotes } from '../hooks/useNotes.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { useTheme } from '../context/ThemeContext.jsx';
import Shell from '../components/Shell.jsx';
import { colorStyle, colorName } from '../lib/colors.js';

/**
 * Insights.
 *
 * Every chart here is a single series, so none of them needs a legend or a
 * categorical palette — the title says what the bars are. One accent hue,
 * stepped separately for each theme rather than dimmed, validated against both
 * surfaces for lightness, chroma and 3:1 contrast.
 *
 * The colour-breakdown chart is the one exception to "don't colour by
 * category": there the colour *is* the category, so painting a bar the note's
 * own colour is the honest encoding rather than a decorative one.
 */
const SERIES = { light: '#2a78d6', dark: '#3987e5' };

function StatTile({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      {/* A hero number: the whole point of this tile is one figure, so it is
          the largest thing in it and nothing competes. */}
      <p className="mt-1 text-3xl font-medium tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle && <p className="mb-3 mt-0.5 text-xs text-muted">{subtitle}</p>}
      {empty ? (
        <p className="grid h-48 place-items-center text-sm text-faint">Nothing to show yet.</p>
      ) : (
        children
      )}
    </section>
  );
}

function Tip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-raised px-3 py-2 text-xs shadow-raised">
      <p className="font-medium text-ink">{label}</p>
      <p className="text-muted">
        {payload[0].value} {suffix || (payload[0].value === 1 ? 'note' : 'notes')}
      </p>
    </div>
  );
}

export default function InsightsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isDark } = useTheme();
  const { labels, query, setQuery, connected } = useNotes({ view: 'active' });
  const notifications = useNotifications();

  const accent = isDark ? SERIES.dark : SERIES.light;
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const axisColor = isDark ? '#9aa0a6' : '#5f6368';

  useEffect(() => {
    api.stats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const timeline = useMemo(
    () =>
      (stats?.timeline || []).map((d) => ({
        ...d,
        // Only the day-and-month, because thirty full dates on one axis is a
        // wall of text nobody reads.
        label: new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      })),
    [stats]
  );

  const totals = stats?.totals || {};
  const axisProps = {
    stroke: axisColor,
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  };

  return (
    <Shell
      query={query}
      setQuery={setQuery}
      labels={labels}
      onManageLabels={() => {}}
      notifications={notifications}
      onOpenPalette={() => {}}
      onOpenNoteById={() => {}}
      connected={connected}
    >
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-2xl font-medium">Insights</h1>
        <p className="mb-6 text-sm text-muted">Everything you have written, counted.</p>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        )}

        {!loading && stats && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Notes" value={totals.active ?? 0} hint={`${totals.total ?? 0} in total`} />
              <StatTile label="Words written" value={(totals.words ?? 0).toLocaleString()} hint="across every note" />
              <StatTile label="Edits" value={totals.totalEdits ?? 0} hint="each one is a saved version" />
              <StatTile label="Labels" value={totals.labels ?? 0} hint={`${totals.pinned ?? 0} notes pinned`} />
              <StatTile label="Checklists" value={totals.checklists ?? 0} />
              <StatTile label="With a reminder" value={totals.withReminder ?? 0} />
              <StatTile label="Shared by you" value={totals.sharedByMe ?? 0} />
              <StatTile label="Shared with you" value={totals.sharedWithMe ?? 0} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <ChartCard
                  title="Notes created"
                  subtitle="The last 30 days"
                  empty={timeline.every((d) => d.count === 0)}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      {/* Horizontal rules only: vertical ones add ink without
                          helping anyone read a value off the y-axis. */}
                      <CartesianGrid stroke={gridColor} vertical={false} />
                      <XAxis dataKey="label" {...axisProps} interval={6} />
                      <YAxis {...axisProps} allowDecimals={false} width={40} />
                      <Tooltip content={<Tip />} cursor={{ stroke: gridColor, strokeWidth: 2 }} />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke={accent}
                        strokeWidth={2}
                        fill="url(#fill)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ChartCard
                title="Notes by label"
                subtitle="Your ten most-used labels"
                empty={!stats.byLabel?.length}
              >
                <ResponsiveContainer width="100%" height={Math.max(180, stats.byLabel.length * 34)}>
                  <BarChart
                    data={stats.byLabel}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid stroke={gridColor} horizontal={false} />
                    <XAxis type="number" {...axisProps} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={90} {...axisProps} />
                    <Tooltip content={<Tip />} cursor={{ fill: gridColor }} />
                    {/* Rounded data-end only, anchored at the baseline. */}
                    <Bar dataKey="count" fill={accent} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Notes by colour"
                subtitle="Each bar wears the colour it counts"
                empty={!stats.byColor?.length}
              >
                <ResponsiveContainer width="100%" height={Math.max(180, stats.byColor.length * 30)}>
                  <BarChart
                    data={stats.byColor.map((c) => ({ ...c, name: colorName(c.color) }))}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid stroke={gridColor} horizontal={false} />
                    <XAxis type="number" {...axisProps} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={90} {...axisProps} />
                    <Tooltip content={<Tip />} cursor={{ fill: gridColor }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                      {stats.byColor.map((c) => (
                        // The category IS a colour, so the bar is painted with
                        // it — and given a surface-coloured stroke so a pale
                        // note colour still reads as a bar against the card.
                        <Cell
                          key={c.color}
                          fill={colorStyle(c.color).background}
                          stroke={colorStyle(c.color).borderColor}
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* The relief rule: several note colours sit below 3:1 against the
                card, so the same numbers are available as text. */}
            <details className="card mt-4 p-4">
              <summary className="cursor-pointer text-sm font-medium">
                See these numbers as a table
              </summary>
              <div className="mt-3 grid gap-6 sm:grid-cols-2">
                <table className="w-full text-sm">
                  <caption className="pb-1 text-left text-xs text-muted">By label</caption>
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted">
                      <th className="py-1 text-left font-medium">Label</th>
                      <th className="py-1 text-right font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byLabel.map((l) => (
                      <tr key={l.name} className="border-t border-line">
                        <td className="py-1">{l.name}</td>
                        <td className="py-1 text-right tabular-nums">{l.count}</td>
                      </tr>
                    ))}
                    {!stats.byLabel.length && (
                      <tr><td colSpan={2} className="py-2 text-muted">No labels yet.</td></tr>
                    )}
                  </tbody>
                </table>

                <table className="w-full text-sm">
                  <caption className="pb-1 text-left text-xs text-muted">By colour</caption>
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted">
                      <th className="py-1 text-left font-medium">Colour</th>
                      <th className="py-1 text-right font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byColor.map((c) => (
                      <tr key={c.color} className="border-t border-line">
                        <td className="py-1">{colorName(c.color)}</td>
                        <td className="py-1 text-right tabular-nums">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </Shell>
  );
}
