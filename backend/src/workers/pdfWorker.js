// ============================================================================
// pdfWorker.js — BullMQ worker that extracts events from an uploaded PDF
// OR image via the Anthropic API and stores them on the ingestion row.
//
// Queue: 'pdf-ingestion'  (name kept for back-compat; handles images too)
// Job payload: { ingestionId }
//
// Auto-starts on import (matches icalWorker/scrapeWorker/emailWorker pattern).
//
// Status transitions:
//   pending -> reading -> parsing -> ready_for_review   (happy path)
//                                  -> failed            (error path)
//
// Branching on ingestion.kind:
//   - 'pdf'   -> Anthropic content block with type='document'
//   - 'image' -> content block with type='image' + media_type from
//                ingestion.original_mime (image/jpeg or image/png).
//                Same prompt and parsing path; the model handles both.
// ============================================================================

import { Worker } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { query, queryOne } from '../db/index.js';
import { buildExtractionSystemPrompt, buildUserMessage } from '../lib/extractionPrompt.js';
import { connection } from './queue.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

// Anthropic limits inline image payloads to ~5MB base64 (which is roughly
// 3.75MB of decoded image bytes once you account for the ~33% base64 overhead).
// We resize anything bigger to a safe ceiling: max 2400px on the long side,
// JPEG quality 75. That's plenty of resolution for OCR'ing a schedule photo
// and reliably lands well under the limit. We deliberately pre-shrink rather
// than waiting for Anthropic to bounce the request — a failed Claude call
// burns tokens on the error response and shows a confusing UX.
//
// 1MB threshold for "is it worth resizing?" — small JPEGs already from a
// digital camera or after-iOS-compression don't need the round-trip through
// libvips.
const MAX_IMAGE_BYTES_FOR_ANTHROPIC = 3_500_000;
const RESIZE_LONG_EDGE_PX = 2400;
const RESIZE_JPEG_QUALITY = 75;

// --- helpers ----------------------------------------------------------------

async function setStatus(ingestionId, status, statusDetail) {
  await query(
    `UPDATE ingestions
        SET status = $1,
            status_detail = $2,
            updated_at = NOW()
      WHERE id = $3`,
    [status, statusDetail || null, ingestionId],
  );
}

async function setFailed(ingestionId, errorMessage) {
  await query(
    `UPDATE ingestions
        SET status = 'failed',
            extraction_error = $1,
            status_detail = 'Extraction failed',
            updated_at = NOW()
      WHERE id = $2`,
    [errorMessage, ingestionId],
  );
}

function stripJsonFences(text) {
  // Claude sometimes wraps JSON in ```json ... ``` despite instructions.
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (!ev.raw_title || !ev.starts_at) return false;
  if (Number.isNaN(Date.parse(ev.starts_at))) return false;
  if (ev.ends_at && Number.isNaN(Date.parse(ev.ends_at))) return false;
  return true;
}

// --- main processor ---------------------------------------------------------

async function processIngestion(job) {
  const { ingestionId } = job.data;

  // kids table has no 'sport' column — pull name + timezone only.
  // The LLM infers the sport from the PDF content itself.
  const ingestion = await queryOne(
    `SELECT i.*, k.name AS kid_name, u.timezone AS user_timezone
       FROM ingestions i
       JOIN kids k ON k.id = i.kid_id
       JOIN users u ON u.id = i.user_id
      WHERE i.id = $1`,
    [ingestionId],
  );

  if (!ingestion) {
    throw new Error('Ingestion not found: ' + ingestionId);
  }
  if (!ingestion.storage_path) {
    await setFailed(ingestionId, 'No file on disk (may have been cleaned up)');
    return;
  }

  const isImage = ingestion.kind === 'image';

  // --- Phase 1: reading ---
  await setStatus(
    ingestionId,
    'reading',
    isImage ? 'Reading your photo...' : 'Reading your PDF...',
  );

  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(ingestion.storage_path);
  } catch (err) {
    await setFailed(ingestionId, 'Could not read file: ' + err.message);
    return;
  }

  // Images coming off modern phones (or full-res screenshots) routinely
  // blow past Anthropic's ~5MB inline-image cap. Resize before encoding
  // so the request always fits, and re-stamp media_type to JPEG since
  // we re-encode regardless of source format. PDFs skip this entirely.
  let mediaTypeForAnthropic = ingestion.original_mime || 'image/jpeg';
  if (isImage && fileBuffer.length > MAX_IMAGE_BYTES_FOR_ANTHROPIC) {
    try {
      fileBuffer = await sharp(fileBuffer)
        .rotate() // honor EXIF orientation (most photos)
        .resize({
          width:           RESIZE_LONG_EDGE_PX,
          height:          RESIZE_LONG_EDGE_PX,
          fit:             'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: RESIZE_JPEG_QUALITY })
        .toBuffer();
      mediaTypeForAnthropic = 'image/jpeg';
    } catch (err) {
      await setFailed(ingestionId, 'Could not process image: ' + err.message);
      return;
    }
  }

  const base64File = fileBuffer.toString('base64');

  // --- Phase 2: parsing ---
  await setStatus(ingestionId, 'parsing', 'Extracting events...');

  const systemPrompt = buildExtractionSystemPrompt({
    kidName: ingestion.kid_name,
    kidSportHint: null, // no sport column on kids — LLM infers from PDF/image
    userTimezone: ingestion.user_timezone,
    currentYear: new Date().getFullYear(),
  });

  // Branch the content block by ingestion kind. Both paths use the same
  // system prompt + user message — Claude handles document and image
  // inputs uniformly when the rest of the conversation is identical.
  const fileBlock = isImage
    ? {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaTypeForAnthropic,
          data: base64File,
        },
      }
    : {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64File,
        },
      };

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            {
              type: 'text',
              text: buildUserMessage({ kidName: ingestion.kid_name }),
            },
          ],
        },
      ],
    });
  } catch (err) {
    await setFailed(ingestionId, 'Anthropic API error: ' + err.message);
    return;
  }

  // --- Phase 3: parse & validate ---
  const textBlocks = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const cleanedText = stripJsonFences(textBlocks);

  let events;
  try {
    events = JSON.parse(cleanedText);
    if (!Array.isArray(events)) throw new Error('Response is not a JSON array');
  } catch (err) {
    await setFailed(
      ingestionId,
      'Could not parse model response as JSON: ' + err.message,
    );
    return;
  }

  const validEvents = events.filter(validateEvent);
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;

  // --- Phase 4: write results ---
  if (validEvents.length === 0) {
    await query(
      `UPDATE ingestions
          SET status = 'ready_for_review',
              status_detail = 'No events found — you can try a different file.',
              extracted_events = $1::jsonb,
              event_count = 0,
              input_tokens = $2,
              output_tokens = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [JSON.stringify([]), inputTokens, outputTokens, ingestionId],
    );
    return;
  }

  const ambiguousCount = validEvents.filter(
    (e) => (e.ambiguous_fields && e.ambiguous_fields.length > 0) || (e.confidence ?? 1) < 0.7,
  ).length;

  const statusDetail =
    ambiguousCount > 0
      ? 'Found ' + validEvents.length + ' events — ' + ambiguousCount + ' need attention'
      : 'Found ' + validEvents.length + ' events';

  await query(
    `UPDATE ingestions
        SET status = 'ready_for_review',
            status_detail = $1,
            extracted_events = $2::jsonb,
            event_count = $3,
            input_tokens = $4,
            output_tokens = $5,
            updated_at = NOW()
      WHERE id = $6`,
    [statusDetail, JSON.stringify(validEvents), validEvents.length, inputTokens, outputTokens, ingestionId],
  );
}

// --- worker boot (auto-start on import, matches icalWorker pattern) --------

const worker = new Worker(
  'pdf-ingestion',
  async (job) => {
    try {
      await processIngestion(job);
    } catch (err) {
      console.error('[pdfWorker] Unhandled error on job ' + job.id, err);
      if (job.data?.ingestionId) {
        await setFailed(job.data.ingestionId, 'Unexpected error: ' + err.message).catch(() => {});
      }
      throw err;
    }
  },
  {
    connection,
    concurrency: 2,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    },
  },
);

worker.on('completed', (job) => console.log(`[pdfWorker] job ${job.id} completed`));
worker.on('failed',    (job, err) => console.error(`[pdfWorker] job ${job.id} failed:`, err?.message));

console.log('[pdfWorker] ready');
export default worker;
