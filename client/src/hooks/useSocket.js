import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, onTokenChange } from '../api/client.js';

const BASE = import.meta.env.VITE_API_URL || undefined;

/**
 * The live connection.
 *
 * Two details that are easy to get wrong and painful to debug:
 *
 * 1. **The token is read at connect time, not captured in a closure.** The
 *    access token is rotated every fifteen minutes; a socket holding the token
 *    it was created with would silently fail to reconnect after the first
 *    rotation, and the app would look fine until someone noticed updates had
 *    quietly stopped arriving.
 *
 * 2. **Handlers are kept in a ref.** Subscribing with the handler in the
 *    dependency array would tear down and rebuild the socket every time the
 *    component re-rendered with a new closure — which, for a board that
 *    re-renders on every keystroke, is constantly.
 */
export function useSocket({ enabled = true, handlers = {} } = {}) {
  const socketRef = useRef(null);
  const handlerRef = useRef(handlers);
  const [connected, setConnected] = useState(false);

  // Assigned in an effect rather than during render. The point of the ref is
  // that the socket subscribes once and always calls the *latest* handler; a
  // write during render is a side effect in the render phase, which React is
  // free to run twice or throw away.
  useEffect(() => {
    handlerRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = io(BASE, {
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['polling', 'websocket'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    const events = [
      'note:changed', 'note:removed', 'notification:new',
      'activity:new', 'presence:state', 'note:typing',
    ];
    events.forEach((event) => {
      socket.on(event, (payload) => handlerRef.current[event]?.(payload));
    });

    // A rotated token means the current connection is authenticated with a
    // credential that no longer exists. Reconnecting picks up the new one.
    const stopWatching = onTokenChange(() => {
      if (socket.connected) socket.disconnect().connect();
    });

    return () => {
      stopWatching();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  return {
    connected,
    socket: socketRef,
    openNote: (noteId, ack) => socketRef.current?.emit('note:open', noteId, ack),
    closeNote: (noteId) => socketRef.current?.emit('note:close', noteId),
    setTyping: (noteId, typing) => socketRef.current?.emit('note:typing', { noteId, typing }),
  };
}
