import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/tokens.js';
import { events, EVENTS } from '../services/events.js';
import { authorize, LEVELS } from '../services/permissions.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Real-time sync and presence.
 *
 * This file is the only place in the server that knows WebSockets exist. It
 * subscribes to the service layer's event bus and forwards what it hears; no
 * service imports anything from here, which is why the whole feature could be
 * deleted without touching a line of business logic.
 *
 * Two kinds of room:
 *
 *   user:<id>   every device signed in as that person. A change is delivered
 *               to the audience the service computed, which is the owner plus
 *               collaborators — so authorisation is decided once, in the
 *               service, and never re-derived here.
 *
 *   note:<id>   everyone with a particular note open. Used only for presence,
 *               and joined only after the same authorize() the HTTP routes use.
 */

// Who is looking at what: noteId -> Map(userId -> { user, sockets:Set }).
const viewers = new Map();

function presenceFor(noteId) {
  const room = viewers.get(noteId);
  if (!room) return [];
  return [...room.values()].map((entry) => entry.user);
}

function broadcastPresence(io, noteId) {
  io.to(`note:${noteId}`).emit('presence:state', { noteId, viewers: presenceFor(noteId) });
}

function addViewer(noteId, user, socketId) {
  if (!viewers.has(noteId)) viewers.set(noteId, new Map());
  const room = viewers.get(noteId);
  const entry = room.get(user.id) || { user, sockets: new Set() };
  entry.sockets.add(socketId);
  room.set(user.id, entry);
}

function removeViewer(noteId, userId, socketId) {
  const room = viewers.get(noteId);
  if (!room) return;
  const entry = room.get(userId);
  if (!entry) return;

  entry.sockets.delete(socketId);
  // Only really gone when their last tab on this note closes — two tabs open
  // and one closed must not read as "they left".
  if (entry.sockets.size === 0) room.delete(userId);
  if (room.size === 0) viewers.delete(noteId);
}

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Long-polling first, upgrading to WebSocket, so the app still works
    // behind a proxy that will not pass an upgrade through.
    transports: ['polling', 'websocket'],
  });

  /**
   * The handshake carries the same access token as an HTTP request. A socket
   * that cannot prove who it is never joins a room, so an unauthenticated
   * connection can hear nothing at all.
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthenticated'));

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select('name email avatarColor');
      if (!user) return next(new Error('unauthenticated'));

      socket.data.user = user.toPeerJSON();
      return next();
    } catch {
      return next(new Error('unauthenticated'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(`user:${user.id}`);
    socket.emit('ready', { user });

    socket.on('note:open', async (noteId, ack) => {
      try {
        // The same authorisation the REST routes use. Presence must not become
        // a side channel that tells you who is reading a note you cannot.
        await authorize(user.id, noteId, LEVELS.READ, { populate: false });
        socket.join(`note:${noteId}`);
        addViewer(noteId, user, socket.id);
        broadcastPresence(io, noteId);
        ack?.({ ok: true, viewers: presenceFor(noteId) });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('note:close', (noteId) => {
      socket.leave(`note:${noteId}`);
      removeViewer(noteId, user.id, socket.id);
      broadcastPresence(io, noteId);
    });

    /** "Someone is typing", scoped to one note. Deliberately not persisted:
     *  it is only true for the couple of seconds it is being said. */
    socket.on('note:typing', ({ noteId, typing }) => {
      socket.to(`note:${noteId}`).emit('note:typing', { noteId, user, typing: Boolean(typing) });
    });

    socket.on('disconnect', () => {
      // A dropped connection has to leave every note it was viewing, or the
      // presence list slowly fills with ghosts.
      for (const [noteId, room] of viewers.entries()) {
        if (room.has(user.id)) {
          removeViewer(noteId, user.id, socket.id);
          broadcastPresence(io, noteId);
        }
      }
    });
  });

  /* ------------------------- the service layer, forwarded to the right rooms */

  const forward = (audience, event, payload) => {
    audience.forEach((userId) => io.to(`user:${userId}`).emit(event, payload));
  };

  events.on(EVENTS.NOTE_CHANGED, ({ note, audience, actorId }) => {
    forward(audience, 'note:changed', { note, actorId });
  });

  events.on(EVENTS.NOTE_REMOVED, ({ noteId, audience, actorId }) => {
    forward(audience, 'note:removed', { noteId, actorId });
  });

  events.on(EVENTS.NOTIFICATION, ({ userId, notification }) => {
    io.to(`user:${userId}`).emit('notification:new', notification);
  });

  events.on(EVENTS.ACTIVITY, ({ noteId, audience, activity }) => {
    forward(audience, 'activity:new', { noteId, activity });
  });

  logger.info('[realtime] socket.io attached');
  return io;
}
