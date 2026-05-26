// ============================================================
// API client
// Thin wrapper around fetch — handles auth headers, JSON
// parsing, and error normalization in one place.
// ============================================================

const BASE = '/api';

function getToken() {
  return localStorage.getItem('sc_token');
}

// AuthProvider registers a callback here on mount. When any authed
// request comes back 401, we fire this so the app can force-logout
// + redirect to /login. Mirrors mobile/lib/api.js's _onUnauthorized
// pattern.
//
// Without this, an expired JWT manifests as a "ghost session": the
// sidebar still shows the cached user because it's hydrated from
// localStorage, but every API call silently 401s and nothing actually
// works. Patton hit this 2026-05-25 and had to manually sign out +
// in to recover. This makes the recovery automatic.
let _onUnauthorized = null;

async function request(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Only force-logout when (a) we sent a token AND (b) the server
    // rejected it. Bare 401s from /auth/login or /auth/signup (e.g.
    // bad password) carry no token, so they fall through to the
    // normal Error throw and are handled by the calling form.
    if (res.status === 401 && token && _onUnauthorized) {
      try { _onUnauthorized(); } catch {}
    }
    const message = data.error || data.errors?.[0]?.msg || 'Something went wrong';
    throw new Error(message);
  }

  return data;
}

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const patch = (path, body) => request('PATCH',  path, body);
const del  = (path)        => request('DELETE', path);

// --- Auth ---
export const api = {
  auth: {
    signup: (data)  => post('/auth/signup', data),
    login:  (data)  => post('/auth/login',  data),
    me:     ()      => get('/auth/me'),
    update: (data)  => patch('/auth/me', data),
    rotateFeedToken: () => post('/auth/rotate-feed-token'),
    inboundAddress:  () => get('/auth/inbound-address'),
  },
  kids: {
    list:   ()          => get('/kids'),
    create: (data)      => post('/kids', data),
    update: (id, data)  => patch(`/kids/${id}`, data),
    delete: (id)        => del(`/kids/${id}`),
  },
  setupAgent: {
    // Backend proxy for the SetupAgent chat. Replaces direct
    // api.anthropic.com calls so VITE_ANTHROPIC_API_KEY can be removed
    // from the deploy. System prompt + kid roster + persistence all
    // live server-side now.
    message: (data) => post('/setup-agent/message', data),
    // Returns the APP_INSTRUCTIONS map (per-app step lists). Used by
    // the SetupAgent's tappable-chip welcome variant to inject
    // deterministic step-by-step instructions when the user picks an
    // app, rather than relying on the model to recite them.
    apps:    ()     => get('/setup-agent/apps'),
  },
  sources: {
    list:    ()          => get('/sources'),
    get:     (id)        => get(`/sources/${id}`),
    create:  (data)      => post('/sources', data),
    update:  (id, data)  => patch(`/sources/${id}`, data),
    delete:  (id)        => del(`/sources/${id}`),
    refresh: (id)        => post(`/sources/${id}/refresh`),
  },
  events: {
    list:  (params = {}) => get(`/events?${new URLSearchParams(params)}`),
    today: ()            => get('/events/today'),
    get:   (id)          => get(`/events/${id}`),
  },
  manual: {
    list:   ()              => get('/manual'),
    create: (data)          => post('/manual', data),
    update: (id, data)      => patch(`/manual/${id}`, data),
    delete: (id, series)    => del(`/manual/${id}${series ? '?series=true' : ''}`),
  },
  billing: {
    checkout: () => post('/billing/checkout'),
    portal:   () => post('/billing/portal'),
  },
  contacts: {
    list:      ()          => get('/contacts'),
    create:    (data)      => post('/contacts', data),
    update:    (id, data)  => patch(`/contacts/${id}`, data),
    delete:    (id)        => del(`/contacts/${id}`),
    sendOptIn: (id)        => post(`/contacts/${id}/send-opt-in`),
  },
  teams: {
    list:            ()                         => get('/teams'),
    create:          (data)                     => post('/teams', data),
    update:          (id, data)                 => patch(`/teams/${id}`, data),
    delete:          (id)                       => del(`/teams/${id}`),
    addMembers:      (id, contact_ids)          => post(`/teams/${id}/members`, { contact_ids }),
    addMembersBulk:  (id, members)              => post(`/teams/${id}/members/bulk`, { members }),
    removeMember:    (id, contactId)            => del(`/teams/${id}/members/${contactId}`),
    createInvite:    (id)                       => post(`/teams/${id}/invites`),
  },
  logistics: {
    list:        ()              => get(`/logistics`),
    get:         (eventId)       => get(`/logistics/${eventId}`),
    assign:      (eventId, data) => post(`/logistics/${eventId}`, data),
    remove:      (eventId, role) => del(`/logistics/${eventId}/${role}`),
    teamRequest: (eventId, data) => post(`/logistics/${eventId}/team-request`, data),
  },
  overrides: {
    getAll: ()                   => get(`/overrides`),
    get:    (eventId)            => get(`/overrides/${eventId}`),
    set:    (eventId, data)      => post(`/overrides/${eventId}`, data),
    remove: (eventId, kidId)     => del(`/overrides/${eventId}/${kidId}`),
  },
};
