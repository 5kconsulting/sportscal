// ============================================================================
// useIngestion.js — upload + polling hook
// Handles: POST /api/ingestions, then polls GET /api/ingestions/:id until
// status is terminal.
// ============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';

const TERMINAL = new Set(['ready_for_review', 'approved', 'rejected', 'failed']);
const POLL_MS = 1500;

// Matches the pattern in lib/api.js — JWT in localStorage under 'sc_token'
function authHeader() {
  const token = localStorage.getItem('sc_token');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

export function useIngestion() {
  const [ingestion, setIngestion] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const pollOnce = useCallback(async (id) => {
    try {
      const res = await fetch('/api/ingestions/' + id, {
        headers: { ...authHeader() },
      });
      if (!res.ok) throw new Error('Poll failed: ' + res.status);
      const data = await res.json();
      setIngestion(data);
      if (TERMINAL.has(data.status)) stopPolling();
    } catch (err) {
      console.error('[useIngestion] poll error', err);
    }
  }, [stopPolling]);

  const uploadPdf = useCallback(async (file, kidId) => {
    setError(null);
    setUploading(true);
    stopPolling();

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kidId', kidId);

      // IMPORTANT: do NOT set Content-Type here — the browser must set it
      // to multipart/form-data with the correct boundary. Only send auth.
      const res = await fetch('/api/ingestions', {
        method: 'POST',
        headers: { ...authHeader() },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Upload failed');
      }
      const created = await res.json();
      setIngestion(created);

      // Start polling
      pollRef.current = setInterval(() => pollOnce(created.id), POLL_MS);
      // kick one immediate poll so UI doesn't wait 1.5s for first status
      pollOnce(created.id);

      return created;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, [pollOnce, stopPolling]);

  const approve = useCallback(async (editedEvents, sourceName) => {
    if (!ingestion) return;
    const res = await fetch('/api/ingestions/' + ingestion.id + '/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({ events: editedEvents, sourceName }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Approve failed');
    }
    const result = await res.json();
    // Refresh our local copy
    pollOnce(ingestion.id);
    return result;
  }, [ingestion, pollOnce]);

  const reject = useCallback(async () => {
    if (!ingestion) return;
    await fetch('/api/ingestions/' + ingestion.id + '/reject', {
      method: 'POST',
      headers: { ...authHeader() },
    });
    stopPolling();
    setIngestion(null);
  }, [ingestion, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setIngestion(null);
    setError(null);
  }, [stopPolling]);

  return {
    ingestion,
    uploading,
    error,
    uploadPdf,
    approve,
    reject,
    reset,
  };
}
