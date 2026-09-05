import { Notification } from '../models/Notification.js';
import { emitNotification } from './events.js';

/**
 * Create a notification and push it to whoever is connected.
 *
 * The row is written first and the push second. A push nobody receives is a
 * missed toast; a push with no row behind it is a notification that vanishes
 * on refresh, which is worse — the user saw something and then could not find
 * it again.
 */
export async function notify(userId, { type, note = null, title, body = '' }) {
  const notification = await Notification.create({ user: userId, type, note, title, body });
  emitNotification(userId, notification.toJSON());
  return notification;
}

export async function listNotifications(userId, { limit = 30 } = {}) {
  const [rows, unread] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 100)),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { notifications: rows.map((n) => n.toJSON()), unread };
}

export async function markRead(userId, notificationId) {
  await Notification.updateOne(
    { _id: notificationId, user: userId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return listNotifications(userId);
}

export async function markAllRead(userId) {
  await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
  return listNotifications(userId);
}

export async function clearAll(userId) {
  await Notification.deleteMany({ user: userId });
  return { notifications: [], unread: 0 };
}
