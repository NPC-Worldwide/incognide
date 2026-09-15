'use strict';

/**
 * OrcaRouter model catalog: live discovery, capability filtering, and a small
 * verified cold-start fallback.
 *
 * The single source of truth is `GET {apiBase}/models` on the configured
 * inference origin, requested with the user's own Bearer key so the catalog
 * reflects what that workspace can actually call. Nothing here guesses a
 * capability from a model's name.
 */

const { modelsEndpoint } = require('./origins');

/** Hard bounds so a hostile or broken catalog cannot exhaust memory. */
const LIMITS = {
  timeoutMs: 10 * 1000,
  maxBytes: 4 * 1024 * 1024,
  maxItems: 5000,
};

const CAPABILITY = {
  CHAT: 'chat',
  EMBEDDING: 'embedding',
  IMAGE: 'image',
  VIDEO: 'video',
  RERANK: 'rerank',
};

/** Endpoint types that can carry a text chat/agent turn. */
const TEXT_ENDPOINT_TYPES = ['openai', 'anthropic', 'gemini', 'openai-response'];

/** Endpoint types that exist only for a non-text job. */
const NON_TEXT_ENDPOINT_TYPES = ['image-generation', 'openai-video', 'jina-rerank', 'embeddings'];

/** Modalities a caller can actually attach. */
const INPUT_MODALITIES = ['text', 'image', 'audio', 'video'];

/**
 * Cold-start fallback. Small, bounded, and every entry carries the metadata
 * the UI needs (context window, input modalities, reasoning ladder). These are
 * only ever used when live discovery fails; on a successful fetch the live
 * catalog is authoritative and none of this is merged into it.
 */
const VERIFIED_SEED = [
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    context_length: 400000,
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_endpoint_types: ['openai', 'openai-response'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'Anthropic: Claude Opus 4.8',
    context_length: 200000,
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    supported_endpoint_types: ['anthropic'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Google: Gemini 3.5 Flash',
    context_length: 1000000,
    architecture: { input_modalities: ['text', 'image', 'audio', 'video'], output_modalities: ['text'] },
    supported_endpoint_types: ['gemini'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek: V4 Pro',
    context_length: 128000,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_endpoint_types: ['openai'],
    reasoning: true,
    reasoning_efforts: ['low', 'medium', 'high'],
  },
  {
    id: 'orcarouter/auto',
    name: 'OrcaRouter: Auto',
    context_length: 200000,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    supported_endpoint_types: ['openai'],
    reasoning: false,
    reasoning_efforts: [],
  },
];

/** Mark seed entries so the UI can label a degraded catalog honestly. */
function seedCatalog() {
  return VERIFIED_SEED.map((m) => Object.assign({}, m, {
    seed: true,
    provider: 'orcarouter',
  }));
}

function asStringArray(value) {
  if (!Array.isArray(value)) return null;
  const out = value.filter((v) => typeof v === 'string' && v);
  return out.length ? out : null;
}

/**
 * Normalise one catalog record. Records we cannot read are dropped rather than
 * guessed at - an unknown shape must not become a selectable model.
 */
function normalizeModel(raw, providerId) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;

  const architecture = raw.architecture && typeof raw.architecture === 'object' ? raw.architecture : {};
  const inputModalities = asStringArray(architecture.input_modalities);
  const outputModalities = asStringArray(architecture.output_modalities);
  const endpointTypes = asStringArray(raw.supported_endpoint_types);

  const efforts = asStringArray(raw.reasoning_efforts)
    || asStringArray(raw.supported_reasoning_efforts)
    || null;

  return {
    id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : id,
    // Vendor/model namespace is preserved verbatim; never rewritten.
    provider: providerId,
    context_length: typeof raw.context_length === 'number' ? raw.context_length : null,
    architecture: {
      input_modalities: inputModalities,
      output_modalities: outputModalities,
    },
    supported_endpoint_types: endpointTypes,
    reasoning: Boolean(raw.reasoning),
    reasoning_efforts: efforts,
    pricing: raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : null,
    seed: false,
  };
}

function hasTextEndpoint(model) {
  const types = model.supported_endpoint_types;
  if (!types) return false;
  return types.some((t) => TEXT_ENDPOINT_TYPES.includes(t));
}

function isDedicatedNonText(model) {
  const types = model.supported_endpoint_types || [];
  const architecture = model.architecture && typeof model.architecture === 'object' ? model.architecture : {};
  const outputs = asStringArray(architecture.output_modalities) || [];
  // A pure generator: it may still advertise an OpenAI-shaped endpoint, but it
  // only ever answers with an image or a video.
  if (outputs.length && outputs.every((m) => m === 'image' || m === 'video')) return true;
  if (types.length && types.every((t) => NON_TEXT_ENDPOINT_TYPES.includes(t))) return true;
  return false;
}

/**
 * Capability filter for one AI input entry point.
 *
 * `inputModalities` is what that entry point will actually upload. A model that
 * does not *declare* a required modality fails closed and stays out of the
 * list, so the selector can never offer something the request would reject.
 */
function filterByCapability(models, { capability, inputModalities = null, providerId = 'orcarouter' } = {}) {
  const list = Array.isArray(models) ? models : [];
  const wanted = capability || CAPABILITY.CHAT;
  const requiredModalties = asStringArray(inputModalities) || [];

  return list.filter((m) => {
    if (!m || !m.id) return false;
    const types = m.supported_endpoint_types || [];
    const declared = (m.architecture && m.architecture.input_modalities) || null;

    switch (wanted) {
      case CAPABILITY.CHAT: {
        if (!hasTextEndpoint(m)) return false;
        if (isDedicatedNonText(m)) return false;
        for (const modality of requiredModalties) {
          if (modality === 'text') continue;
          // Fail closed: an undeclared modality is not an assumed one.
          if (!declared || !declared.includes(modality)) return false;
        }
        return true;
      }
      case CAPABILITY.EMBEDDING:
        return types.includes('embeddings');
      case CAPABILITY.IMAGE:
        return types.includes('image-generation');
      case CAPABILITY.VIDEO:
        return types.includes('openai-video');
      case CAPABILITY.RERANK:
        return types.includes('jina-rerank');
      default:
        return false;
    }
  }).map((m) => (m.provider ? m : Object.assign({}, m, { provider: providerId })));
}

/** Query parameter used on the live catalog request for a capability. */
function capabilityQuery(capability) {
  switch (capability) {
    case CAPABILITY.CHAT: return 'chat';
    case CAPABILITY.EMBEDDING: return 'embedding';
    case CAPABILITY.IMAGE: return 'image';
    default: return null;
  }
}

/**
 * Fetch the live catalog. Bounded in time, bytes, and item count; records that
 * cannot be parsed into a model we could call are dropped.
 *
 * The API key stays in this process. Only normalised model metadata is returned
 * to callers, so a renderer never holds a credential.
 */
async function fetchCatalog({
  apiBase,
  apiKey,
  capability = CAPABILITY.CHAT,
  fetchImpl = globalThis.fetch,
  limits = LIMITS,
} = {}) {
  const base = apiBase || require('./origins').resolveOrigins().apiBase;
  let url = modelsEndpoint(base);
  const query = capabilityQuery(capability);
  if (query) url = `${url}?capability=${encodeURIComponent(query)}`;

  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(limits.timeoutMs) });
  } catch (err) {
    return { ok: false, error: 'network_error', message: 'Could not reach the OrcaRouter model catalog.' };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'unauthorized', status: res.status, message: 'OrcaRouter rejected the stored credential.' };
  }
  if (res.status === 429) {
    return { ok: false, error: 'rate_limited', status: res.status, message: 'OrcaRouter rate-limited the model catalog request.' };
  }
  if (!res.ok) {
    return { ok: false, error: 'http_error', status: res.status, message: `OrcaRouter model catalog returned HTTP ${res.status}.` };
  }

  let text;
  try {
    text = await res.text();
  } catch {
    return { ok: false, error: 'network_error', message: 'The OrcaRouter model catalog response could not be read.' };
  }
  if (text.length > limits.maxBytes) {
    return { ok: false, error: 'response_too_large', message: 'The OrcaRouter model catalog response exceeded the size limit.' };
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_response', message: 'The OrcaRouter model catalog returned an unreadable response.' };
  }

  const raw = Array.isArray(payload) ? payload : (payload && (payload.data || payload.models));
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'invalid_response', message: 'The OrcaRouter model catalog had an unexpected shape.' };
  }

  const models = [];
  for (const record of raw.slice(0, limits.maxItems)) {
    const model = normalizeModel(record, 'orcarouter');
    if (model) models.push(model);
  }

  return { ok: true, models, source: 'live', truncated: raw.length > limits.maxItems };
}

/**
 * Resolve the model list for one entry point.
 *
 * Order matters: a successful live fetch is authoritative and the seed is never
 * mixed into it. The seed is only a bounded outage fallback, and it is labelled
 * `degraded` so the UI can say so instead of silently showing less.
 */
async function resolveCatalog({
  apiBase,
  apiKey,
  capability = CAPABILITY.CHAT,
  inputModalities = null,
  fetchImpl = globalThis.fetch,
  limits = LIMITS,
  lastKnownGood = null,
} = {}) {
  const live = await fetchCatalog({ apiBase, apiKey, capability, fetchImpl, limits });

  if (live.ok) {
    const models = filterByCapability(live.models, { capability, inputModalities });
    return {
      ok: true,
      models,
      source: 'live',
      degraded: false,
      total: live.models.length,
    };
  }

  const fallbackSource = Array.isArray(lastKnownGood) && lastKnownGood.length ? lastKnownGood : seedCatalog();
  const models = filterByCapability(fallbackSource, { capability, inputModalities });
  return {
    ok: true,
    models,
    source: Array.isArray(lastKnownGood) && lastKnownGood.length ? 'last_known_good' : 'seed',
    degraded: true,
    error: live.error,
    message: live.message,
    total: fallbackSource.length,
  };
}

/**
 * Re-validate a persisted model id before restoring it. A stale selection that
 * is no longer compatible must be cleared rather than silently kept.
 */
function isStillCompatible(models, modelId, options = {}) {
  if (!modelId) return false;
  return filterByCapability(models, options).some((m) => m.id === modelId);
}

module.exports = {
  LIMITS,
  CAPABILITY,
  TEXT_ENDPOINT_TYPES,
  NON_TEXT_ENDPOINT_TYPES,
  INPUT_MODALITIES,
  VERIFIED_SEED,
  seedCatalog,
  normalizeModel,
  filterByCapability,
  capabilityQuery,
  fetchCatalog,
  resolveCatalog,
  isStillCompatible,
};
