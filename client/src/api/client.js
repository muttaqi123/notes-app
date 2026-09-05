const BASE = import.meta.env.VITE_API_URL || '';

/**
 * The access token lives in a module variable, not in localStorage.
 *
 * localStorage is readable by any script on the page, so an XSS bug there is a
 * stolen session. Held in memory it dies with the tab, and the httpOnly
 * refresh cookie — which JavaScript cannot read at all — is what survives a
 * reload and silently mints a new access token on start-up.
 */
let accessToken = null;
const listeners = new Set();

export function setAccessToken(token) {
  accessToken = token;
  listeners.forEach((fn) => fn(token));
}

export function getAccessToken() {
  return accessToken;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

let refreshing = null;

/**
 * Ask for a new access token. Concurrent callers share one in-flight request:
 * without this, a screen that fires five requests on load would send five
 * refreshes, and refresh-token rotation means four of them would be rejected
 * and sign the user out.
 */
async function refreshAccessToken() {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, 'Session expired', 'bad_refresh');
        const body = await parse(res);
        setAccessToken(body.accessToken);
        return body;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && retry) {
    // One automatic retry after a refresh, so a 15-minute access token expiring
    // mid-session is invisible to the user instead of a sudden logout.
    try {
      await refreshAccessToken();
      return request(path, { method, body, retry: false });
    } catch {
      setAccessToken(null);
    }
  }

  const data = await parse(res);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message || res.statusText, data?.error?.code);
  }
  return data;
}

export const api = {
  // — auth —
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  restoreSession: refreshAccessToken,

  // — notes —
  listNotes: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return request(`/api/notes${qs ? `?${qs}` : ''}`);
  },
  createNote: (note) => request('/api/notes', { method: 'POST', body: note }),
  updateNote: (id, patch) => request(`/api/notes/${id}`, { method: 'PATCH', body: patch }),
  trashNote: (id) => request(`/api/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id) => request(`/api/notes/${id}/restore`, { method: 'POST' }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),
  emptyTrash: () => request('/api/notes/trash', { method: 'DELETE' }),
  listVersions: (id) => request(`/api/notes/${id}/versions`),
  restoreVersion: (id, version) =>
    request(`/api/notes/${id}/versions/${version}/restore`, { method: 'POST' }),

  // — labels —
  listLabels: () => request('/api/labels'),
  createLabel: (payload) => request('/api/labels', { method: 'POST', body: payload }),
  updateLabel: (id, payload) => request(`/api/labels/${id}`, { method: 'PATCH', body: payload }),
  deleteLabel: (id) => request(`/api/labels/${id}`, { method: 'DELETE' }),
};
