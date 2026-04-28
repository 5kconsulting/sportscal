// ============================================================
// API client
// Thin wrapper around fetch — handles auth headers, JSON
// parsing, and error normalization in one place.
// ============================================================

const BASE = '/api';

function getToken() {
  return localStorage.getItem('sc_token');
}

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
    const message = data.error || data.errors?.[0]?.msg || 'Something went wrong';
    throw new Error(message);
  }

  return data;
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
  },
  kids: {
    list:   ()          => get('/kids'),
    create: (data)      => post('/kids', data),
    update: (id, data)  => patch(`/kids/${id}`, data),
    delete: (id)        => del(`/kids/${id}`),
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
    list:           ()                         => get('/teams'),
    create:         (data)                     => post('/teams', data),
    update:         (id, data)                 => patch(`/teams/${id}`, data),
    delete:         (id)                       => del(`/teams/${id}`),
    addMembers:     (id, contact_ids)          => post(`/teams/${id}/members`, { contact_ids }),
    removeMember:   (id, contactId)            => del(`/teams/${id}/members/${contactId}`),
  },
  logistics: {
    list:   ()               => get(`/logistics`),
    get:    (eventId)        => get(`/logistics/${eventId}`),
    assign: (eventId, data)  => post(`/logistics/${eventId}`, data),
    remove: (eventId, role)  => del(`/logistics/${eventId}/${role}`),
  },
  overrides: {
    getAll: ()                   => get(`/overrides`),
    get:    (eventId)            => get(`/overrides/${eventId}`),
    set:    (eventId, data)      => post(`/overrides/${eventId}`, data),
    remove: (eventId, kidId)     => del(`/overrides/${eventId}/${kidId}`),
  },
};
