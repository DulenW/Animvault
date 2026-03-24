// lib/cache.js
// Shared in-memory cache instance used across the whole addon.
// Default TTL: 6 hours — fine for catalog results and full metadata bundles.
// Individual TMDB→IMDB ID mappings are stored with a 24-hour TTL since they rarely change.

const NodeCache = require('node-cache');

const SIX_HOURS = 6 * 60 * 60; // 21600 seconds

const cache = new NodeCache({
  stdTTL:       SIX_HOURS, // default expiry for every key
  checkperiod:  600,        // sweep for expired keys every 10 minutes
  useClones:    false,      // skip deep-cloning on get/set for performance
  deleteOnExpire: true,
});

cache.on('expired', (key) => {
  console.log(`[Cache] Expired: ${key}`);
});

module.exports = cache;
