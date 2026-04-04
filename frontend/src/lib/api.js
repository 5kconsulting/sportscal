const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

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

const get   = (path)       => request('GET',    path);
const post  = (path, body) => request('POST',   path, body);
const patch = (path, body) => request('PATCH',  path, body);
const del   = (path)       => request('DELETE', path);

export const api = {
  auth: {
    signup: (data)  => post('/auth/signup', data),
    login:  (data)  => post('/auth/login',  data),
    me:     ()      => get('/auth/me'),
    update: (data)  => patch('/auth/me', data),
    rotateFeedToken: () => post('/auth/rotate-feed-token'),
  },
  kids: {
    list:   ()         => get('/kids'),
    create: (data)     => post('/kids', data),
    update: (id, data) => patch(`/kids/${id}`, data),
    delete: (id)       => del(`/kids/${id}`),
  },
  sources: {
    list:    ()         => get('/sources'),
    get:     (id)       => get(`/sources/${id}`),
    create:  (data)     => post('/sources', data),
    update:  (id, data) => patch(`/sources/${id}`, data),
    delete:  (id)       => del(`/sources/${id}`),
    refresh: (id)       => post(`/sources/${id}/refresh`),
  },
  events: {
    list:  (params = {}) => get(`/events?${new URLSearchParams(params)}`),
    today: ()            => get('/events/today'),
    get:   (id)          => get(`/events/${id}`),
  },
  manual: {
    list:   ()         => get('/manual'),
    create: (data)     => post('/manual', data),
    update: (id, data) => patch(`/manual/${id}`, data),
    delete: (id)       => del(`/manual/${id}`),
  },
};
