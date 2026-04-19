// ============================================================================
// pdfWorker.js — BullMQ worker that extracts events from an uploaded PDF
// via the Anthropic API and stores them on the ingestion row.
//
// Queue: 'pdf-ingestion'
// Job payload: { ingestionId }
//
// Status transitions:
//   pending -> reading -> parsing -> ready_for_review   (happy path)
//                                  -> failed            (error path)
// ============================================================================

import { Worker } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import { query, queryOne } from '../db/index.js';
import { buildExtractionSystemPrompt, buildUserMessage } from '../lib/extractionPrompt.js';

const CONNECTION = {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
  },
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

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

  // NOTE: kids table has no 'sport' column — we only pull name + timezone.
  // The LLM infers the sport from the PDF content itself, which is usually fine.
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

  // --- Phase 1: reading ---
  await setStatus(ingestionId, 'reading', 'Reading your PDF...');

  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(ingestion.storage_path);
  } catch (err) {
    await setFailed(ingestionId, 'Could not read file: ' + err.message);
    return;
  }

  const base64Pdf = fileBuffer.toString('base64');

  // --- Phase 2: parsing ---
  await setStatus(ingestionId, 'parsing', 'Extracting events...');

  const systemPrompt = buildExtractionSystemPrompt({
    kidName: ingestion.kid_name,
    kidSportHint: null, // no sport column on kids — LLM infers from PDF
    userTimezone: ingestion.user_timezone,
    currentYear: new Date().getFullYear(),
  });

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
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            },
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

// --- worker boot ------------------------------------------------------------

export function startPdfWorker() {
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
      ...CONNECTION,
      concurrency: 2,
    },
  );

  worker.on('ready', () => console.log('[pdfWorker] ready'));
  worker.on('failed', (job, err) => {
    console.error('[pdfWorker] job failed', job?.id, err?.message);
  });

  return worker;
}
