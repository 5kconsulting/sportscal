// Tiny fetch wrapper that knows the backend base URL + auth token.
// Mirrors the shape of frontend/src/lib/api.js so code ports cleanly.

import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl
  || 'https://sportscal-production.up.railway.app';

let _token = null;
let _onUnauthorized = null; // AuthProvider hooks into this to force-logout on 401

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers.Authorization = 'Bearer ' + _token;

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Empty bodies (204 etc.) shouldn't throw on json()
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    // Any authenticated request that comes back 401 means our token is no
    // longer valid — force the app back to the login screen.
    if (res.status === 401 && _token && _onUnauthorized) {
      try { await _onUnauthorized(); } catch {}
    }
    const errMsg = data.error
      || data.errors?.[0]?.msg
      || ('HTTP ' + res.status);
    const err = new Error(errMsg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  setToken(t) { _token = t; },
  setUnauthorizedHandler(fn) { _onUnauthorized = fn; },
  get:  (path)        => request('GET',    path),
  post: (path, body)  => request('POST',   path, body),
  patch:(path, body)  => request('PATCH',  path, body),
  del:  (path)        => request('DELETE', path),
};
