/**
 * A person, as a coloured initial.
 *
 * The colour is assigned server-side from a hash of the email, so the same
 * person is the same colour on every device and in every session without
 * anyone choosing or storing a preference.
 */
export default function Avatar({ user, size = 28, title }) {
  if (!user) return null;
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <span
      title={title ?? `${user.name} · ${user.email}`}
      aria-label={user.name}
      className="grid shrink-0 place-items-center rounded-full font-medium text-white ring-2 ring-app"
      style={{
        width: size,
        height: size,
        background: user.avatarColor || '#1a73e8',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </span>
  );
}

/** Overlapping avatars, with a "+3" when there are more than will fit. */
export function AvatarStack({ users = [], max = 3, size = 26 }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="grid place-items-center rounded-full bg-subtle text-[10px] font-medium text-muted ring-2 ring-app"
          style={{ width: size, height: size }}
          title={users.slice(max).map((u) => u.name).join(', ')}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
