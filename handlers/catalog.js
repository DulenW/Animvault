// handlers/catalog.js
// Stremio catalog handler — returns lists of titles for each catalog defined in manifest.js.
//
// Stremio calls this handler with { type, id, extra } where:
//   type  — 'movie' or 'series'
//   id    — catalog ID from manifest.js (e.g. 'animvault_popular')
//   extra — optional filters: { genre: 'Comedy', skip: '20' }

const tmdb = require('../lib/tmdb');

// Map "type:catalogId" → TMDB fetch function.
// Using the composite key lets the same catalog ID serve both movie and series
// (e.g. 'animvault_classics' exists for both types).
const CATALOG_MAP = {
  'movie:animvault_popular':   (extra) => tmdb.getPopularAnimatedMovies(extra),
  'movie:animvault_classics':  (extra) => tmdb.getClassicCartoonMovies(extra),
  'series:animvault_classics': (extra) => tmdb.getClassicCartoonSeries(extra),
  'series:animvault_series':   (extra) => tmdb.getAnimatedSeries(extra),
};

module.exports = async function catalogHandler({ type, id, extra }) {
  const key = `${type}:${id}`;
  console.log(`[Catalog] ${key}  extra=${JSON.stringify(extra || {})}`);

  const handler = CATALOG_MAP[key];
  if (!handler) {
    console.warn(`[Catalog] Unknown catalog: ${key}`);
    return { metas: [] };
  }

  try {
    const metas = await handler(extra || {});
    console.log(`[Catalog] ${key} → ${metas.length} items`);

    // cacheMaxAge tells Stremio how long to keep this response in its own cache (seconds).
    // We use 1 hour here; our server-side cache TTL is 6 hours.
    return { metas, cacheMaxAge: 3600 };
  } catch (err) {
    console.error(`[Catalog] Error in ${key}:`, err.message);
    return { metas: [] };
  }
};
