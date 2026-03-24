// manifest.js
// Defines what this addon provides to Stremio: name, catalogs, resources, and supported types.

const GENRES = ['Action', 'Comedy', 'Adventure', 'Family', 'Fantasy', 'Sci-Fi'];

// Shared extra fields for all catalogs: genre filter + pagination via skip
const catalogExtra = [
  { name: 'genre', isRequired: false, options: GENRES },
  { name: 'skip',  isRequired: false },
];

module.exports = {
  // Unique reverse-domain identifier for this addon
  id: 'community.animvault',
  version: '1.0.0',
  name: 'AnimVault',
  description:
    'Animated movies, classic cartoons, and animated series — all curated from TMDB.',

  // Resources this addon provides
  resources: ['catalog', 'meta', 'stream'],

  // Content types we handle
  types: ['movie', 'series'],

  // Only handle IMDB IDs (tt prefix) for meta and stream
  idPrefixes: ['tt'],

  catalogs: [
    // ── Movies ──────────────────────────────────────────────────────────────
    {
      type:  'movie',
      id:    'animvault_popular',
      name:  'Popular Animation',
      extra: catalogExtra,
    },
    {
      type:  'movie',
      id:    'animvault_classics',
      name:  'Classic Cartoons',
      extra: catalogExtra,
    },

    // ── Series ───────────────────────────────────────────────────────────────
    {
      type:  'series',
      id:    'animvault_classics',   // same ID, different type → shows in the series section
      name:  'Classic Cartoons',
      extra: catalogExtra,
    },
    {
      type:  'series',
      id:    'animvault_series',
      name:  'Animated Series',
      extra: catalogExtra,
    },
  ],

  behaviorHints: {
    adult: false,
    configurable: false,
  },
};
