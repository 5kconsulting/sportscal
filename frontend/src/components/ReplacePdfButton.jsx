// ============================================================================
// ReplacePdfButton.jsx — a button that lets the user replace an existing
// PDF-ingested source's events by uploading a new PDF for the same kid.
//
// Self-contained: owns its own useIngestion hook + review modal. Consumers
// just drop <ReplacePdfButton source={source} kidId={kidId} onReplaced={...}/>
// into the Sources page and don't need to manage ingestion state upstream.
//
// Props:
//   source       — { id, name } of the PDF source to replace
//   kidId        — the kid this source is linked to (required by backend)
//   kidName      — for the review modal header
//   onReplaced() — called after a successful replace, to let the parent
//                  refresh its sources list
// ============================================================================

import { useRef, useState, useEffect } from 'react';
import { useIngestion } from '../hooks/useIngestion.js';
import IngestionReviewModal from './IngestionReviewModal.jsx';

export function ReplacePdfButton({ source, kidId, kidName, onReplaced }) {
  const fileRef = useRef(null);
  const { ingestion, uploading, error, uploadPdf, approve, reject, reset } = useIngestion();
  const [showModal, setShowModal] = useState(false);

  // Open review modal automatically when extraction completes.
  useEffect(() => {
    if (ingestion?.status === 'ready_for_review') setShowModal(true);
  }, [ingestion?.status]);

  function handleClick() {
    if (!kidId) {
      // Shouldn't happen: parent only renders this button when kid is known.
      // Defensive fallback so the click at least fails visibly.
      alert('Cannot replace — no kid is linked to this source.');
      return;
    }
    fileRef.current?.click();
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected later if needed.
    e.target.value = '';
    if (!file) return;

    try {
      await uploadPdf(file, kidId, source.id);
    } catch {
      // useIngestion already stashed the error in its own state;
      // we surface it below the button.
    }
  }

  async function handleApprove(editedEvents, sourceName) {
    const result = await approve(editedEvents, sourceName);
    setShowModal(false);
    reset();
    onReplaced?.(result);
  }

  function handleCancel() {
    // User hit × or cancelled — discard the ingestion server-side.
    reject();
    setShowModal(false);
  }

  // Status pill during upload/extraction (before the modal opens)
  const inFlight = ingestion && !['approved', 'rejected'].includes(ingestion.status);
  const showingModal = showModal && ingestion?.status === 'ready_for_review';

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleClick}
        disabled={uploading || (inFlight && !showingModal)}
        title={`Upload a new PDF to replace this source's events`}
      >
        {uploading
          ? 'Uploading…'
          : inFlight && !showingModal
            ? 'Processing…'
            : 'Replace PDF'}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChosen}
        style={{ display: 'none' }}
      />

      {error && (
        <div className="error-msg" style={{ marginTop: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      {showingModal && (
        <IngestionReviewModal
          ingestion={ingestion}
          kidName={kidName}
          onApprove={handleApprove}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
