// index.js
// AnimVault — Stremio addon entry point.
//
// Wires together the manifest, handlers, and HTTP server provided by the
// stremio-addon-sdk. The SDK handles routing, CORS, and cache headers.
// Responses are gzip-compressed by the SDK's underlying HTTP server.

require('dotenv').config();

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const manifest       = require('./manifest');
const catalogHandler = require('./handlers/catalog');
const metaHandler    = require('./handlers/meta');
const streamHandler  = require('./handlers/stream');

// ── Startup validation ────────────────────────────────────────────────────────

if (!process.env.TMDB_API_KEY) {
  console.error('');
  console.error('[AnimVault] ERROR: TMDB_API_KEY is not set.');
  console.error('[AnimVault]   1. Copy .env.example to .env');
  console.error('[AnimVault]   2. Set TMDB_API_KEY to your key from:');
  console.error('[AnimVault]      https://www.themoviedb.org/settings/api');
  console.error('');
  process.exit(1);
}

// ── Addon builder ─────────────────────────────────────────────────────────────

const builder = new addonBuilder(manifest);

// Each handler must return a Promise (async functions satisfy this).
// Errors inside handlers are caught within the handler and return empty results
// so the SDK never crashes on a single bad response.

builder.defineCatalogHandler((args) => catalogHandler(args));
builder.defineMetaHandler((args)    => metaHandler(args));
builder.defineStreamHandler((args)  => streamHandler(args));

// ── HTTP server ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '7001', 10);

serveHTTP(builder.getInterface(), { port: PORT });

// ── Startup banner ────────────────────────────────────────────────────────────

const LOCAL     = `http://localhost:${PORT}`;
const MANIFEST  = `${LOCAL}/manifest.json`;

console.log('');
console.log('  ╔═══════════════════════════════════════════════════╗');
console.log('  ║            AnimVault — Stremio Addon              ║');
console.log('  ╠═══════════════════════════════════════════════════╣');
console.log(`  ║  Server:      ${LOCAL.padEnd(35)} ║`);
console.log(`  ║  Manifest:    ${MANIFEST.padEnd(35)} ║`);
console.log('  ╠═══════════════════════════════════════════════════╣');
console.log('  ║  Install in Stremio → Add-ons → paste above URL  ║');
console.log('  ╚═══════════════════════════════════════════════════╝');
console.log('');
