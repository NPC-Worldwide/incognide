/**
 * Builds the catalog fixture used by the UI evidence run.
 *
 * Reads the live OrcaRouter `/v1/models` response and applies the shipped
 * capability filters, so the options the harness renders are produced by the
 * same code the application uses - not by a hand-written list.
 *
 * Usage: node tests/evidence/build_catalog_data.mjs <raw-models.json> <out.json>
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalog = require('../../src/services/orcarouter/catalog.js');

const [, , rawPath, outPath] = process.argv;
if (!rawPath || !outPath) {
  console.error('usage: build_catalog_data.mjs <raw-models.json> <out.json>');
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const raw = Array.isArray(payload) ? payload : payload.data || payload.models || [];
const models = raw.map((r) => catalog.normalizeModel(r, 'orcarouter')).filter(Boolean);

const slim = (m) => ({
  id: m.id,
  name: m.name,
  architecture: m.architecture,
  supported_endpoint_types: m.supported_endpoint_types,
  context_length: m.context_length,
});

const build = (capability, inputModalities, source) =>
  catalog.filterByCapability(source, { capability, inputModalities }).map(slim);

fs.writeFileSync(
  outPath,
  JSON.stringify({
    total: raw.length,
    text: build('chat', ['text'], models),
    multimodal: build('chat', ['text', 'image'], models),
    embedding: build('embedding', null, models),
    image: build('image', null, models),
    // The verified outage fallback, filtered the same way a live list is.
    seed: catalog.filterByCapability(catalog.seedCatalog(), { capability: 'chat', inputModalities: ['text'] }),
  }, null, 1)
);

console.log(JSON.stringify({
  total: raw.length,
  text: build('chat', ['text'], models).length,
  multimodal: build('chat', ['text', 'image'], models).length,
  embedding: build('embedding', null, models).length,
  image: build('image', null, models).length,
}));
