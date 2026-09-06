import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

/**
 * Short-lived messages, with an optional action.
 *
 * The action is what makes this more than decoration: "Note moved to trash —
 * Undo" turns a destructive click into a reversible one, which is the whole
 * reason a toast is better than a confirmation dialog for this kind of thing.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ message, action, actionLabel, duration = 5000, tone = 'default' }) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-2), { id, message, action, actionLabel, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss, toasts }), [toast, dismiss, toasts]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}
