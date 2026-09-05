import { EventEmitter } from 'node:events';

/**
 * The bus between the service layer and anything that wants to react to it.
 *
 * This is what lets real-time sync exist without breaking the rule that
 * services import no framework. A service says "this note changed, and these
 * users can see it"; it does not know whether anything is listening, and it
 * certainly does not know what a WebSocket is. The Socket.IO layer subscribes
 * here, and the reminder scheduler publishes here.
 *
 * The practical consequence: every service function stays directly testable,
 * and the test suite runs with nothing subscribed at all.
 */
export const events = new EventEmitter();

// A busy note with several collaborators can legitimately have more listeners
// than the default warning threshold of ten.
events.setMaxListeners(50);

export const EVENTS = {
  NOTE_CHANGED: 'note:changed',
  NOTE_REMOVED: 'note:removed',
  NOTIFICATION: 'notification:new',
  ACTIVITY: 'activity:new',
};

/**
 * @param note        the note's JSON, as the API would return it
 * @param audience    user ids allowed to see this change
 * @param actorId     who caused it — the client uses this to avoid echoing
 *                    a change back onto the tab that made it
 */
export function emitNoteChanged(note, audience, actorId) {
  events.emit(EVENTS.NOTE_CHANGED, { note, audience: audience.map(String), actorId: String(actorId) });
}

export function emitNoteRemoved(noteId, audience, actorId) {
  events.emit(EVENTS.NOTE_REMOVED, {
    noteId: String(noteId),
    audience: audience.map(String),
    actorId: String(actorId),
  });
}

export function emitNotification(userId, notification) {
  events.emit(EVENTS.NOTIFICATION, { userId: String(userId), notification });
}

export function emitActivity(noteId, audience, activity) {
  events.emit(EVENTS.ACTIVITY, {
    noteId: String(noteId),
    audience: audience.map(String),
    activity,
  });
}
