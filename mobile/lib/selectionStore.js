// Tiny in-memory bridge so modals (like the contact picker) can hand
// a result back to the screen that opened them. Expo Router's
// back-with-params story is awkward for non-serializable payloads,
// so we key each "session" with a short id and just pass the id through
// the URL.
//
// Usage from the opener:
//   const sessionId = selectionStore.createSession((contact) => { ... });
//   router.push(`/contacts/picker?session=${sessionId}&role=pickup`);
//
// Usage from the picker on selection:
//   selectionStore.resolve(sessionId, contact);
//   router.back();
//
// Opener is expected to call selectionStore.cancel(sessionId) if it
// navigates away before a result arrives.

const sessions = new Map();

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export const selectionStore = {
  createSession(onResolve) {
    const id = makeId();
    sessions.set(id, onResolve);
    return id;
  },
  resolve(id, value) {
    const cb = sessions.get(id);
    if (cb) {
      sessions.delete(id);
      cb(value);
    }
  },
  cancel(id) {
    sessions.delete(id);
  },
};
