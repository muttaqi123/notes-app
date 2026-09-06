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

/** Used by the socket layer, which has to reconnect with a fresh token when
 *  this one is rotated. */
export function onTokenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class ApiError extends Error {
  constructor(status, message, code, payload) {
    super(message);
    this.status = status;
    this.code = code;
    // A 409 carries the note as it currently stands; the conflict dialog needs
    // it, so the whole body is kept rather than just the message.
    this.payload = payload;
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
    refreshing = fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
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

async function request(path, { method = 'GET', body, retry = true, raw = false, form } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      // FormData sets its own Content-Type, including the multipart boundary,
      // which cannot be written by hand.
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(form ? { body: form } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && retry) {
    // One automatic retry after a refresh, so a 15-minute access token expiring
    // mid-session is invisible to the user instead of a sudden logout.
    try {
      await refreshAccessToken();
      return request(path, { method, body, form, raw, retry: false });
    } catch {
      setAccessToken(null);
    }
  }

  if (raw) {
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    return res;
  }

  const data = await parse(res);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message || res.statusText, data?.error?.code, data);
  }
  return data;
}

const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // — auth —
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  logoutEverywhere: () => request('/api/auth/logout-everywhere', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  restoreSession: refreshAccessToken,
  updateSettings: (patch) => request('/api/auth/settings', { method: 'PATCH', body: patch }),
  changePassword: (payload) => request('/api/auth/change-password', { method: 'POST', body: payload }),
  sessions: () => request('/api/auth/sessions'),
  revokeSession: (id) => request(`/api/auth/sessions/${id}`, { method: 'DELETE' }),
  forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (payload) => request('/api/auth/reset-password', { method: 'POST', body: payload }),

  // — two factor —
  twoFactorStatus: () => request('/api/auth/2fa'),
  twoFactorSetup: () => request('/api/auth/2fa/setup', { method: 'POST' }),
  twoFactorConfirm: (code) => request('/api/auth/2fa/confirm', { method: 'POST', body: { code } }),
  twoFactorDisable: (password) => request('/api/auth/2fa/disable', { method: 'POST', body: { password } }),

  // — notes —
  listNotes: (params = {}) => request(`/api/notes${qs(params)}`),
  getNote: (id) => request(`/api/notes/${id}`),
  createNote: (note) => request('/api/notes', { method: 'POST', body: note }),
  updateNote: (id, patch) => request(`/api/notes/${id}`, { method: 'PATCH', body: patch }),
  reorderNotes: (order) => request('/api/notes/reorder', { method: 'PATCH', body: { order } }),
  trashNote: (id) => request(`/api/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id) => request(`/api/notes/${id}/restore`, { method: 'POST' }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),
  emptyTrash: () => request('/api/notes/trash', { method: 'DELETE' }),
  stats: () => request('/api/notes/stats'),

  listVersions: (id) => request(`/api/notes/${id}/versions`),
  restoreVersion: (id, version) =>
    request(`/api/notes/${id}/versions/${version}/restore`, { method: 'POST' }),
  listActivity: (id) => request(`/api/notes/${id}/activity`),

  // — collaboration —
  collaborators: (id) => request(`/api/notes/${id}/collaborators`),
  share: (id, payload) => request(`/api/notes/${id}/collaborators`, { method: 'POST', body: payload }),
  setRole: (id, userId, role) =>
    request(`/api/notes/${id}/collaborators/${userId}`, { method: 'PATCH', body: { role } }),
  revokeShare: (id, userId) =>
    request(`/api/notes/${id}/collaborators/${userId}`, { method: 'DELETE' }),
  leaveNote: (id) => request(`/api/notes/${id}/leave`, { method: 'POST' }),

  // — attachments —
  addAttachment: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return request(`/api/notes/${id}/attachments`, { method: 'POST', form });
  },
  removeAttachment: (id, attachmentId) =>
    request(`/api/notes/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),

  // — labels —
  listLabels: () => request('/api/labels'),
  createLabel: (payload) => request('/api/labels', { method: 'POST', body: payload }),
  updateLabel: (id, payload) => request(`/api/labels/${id}`, { method: 'PATCH', body: payload }),
  deleteLabel: (id) => request(`/api/labels/${id}`, { method: 'DELETE' }),

  // — notifications —
  notifications: () => request('/api/notifications'),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'POST' }),
  clearNotifications: () => request('/api/notifications', { method: 'DELETE' }),

  // — export —
  exportUrl: (format) => `${BASE}/api/export/${format}`,
  download: async (format) => {
    // Fetched rather than linked, because the endpoint needs the Authorization
    // header and a plain <a href> cannot carry one.
    const res = await request(`/api/export/${format}`, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keep-notes-export.${format === 'json' ? 'json' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const assetUrl = (path) => `${BASE}${path}`;
