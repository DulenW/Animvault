// lib/tmdb.js
// TMDB API wrapper. Handles all outbound HTTP requests to api.themoviedb.org,
// maps TMDB items to Stremio-compatible meta objects, and caches everything
// using the shared cache instance.

const axios  = require('axios');
const cache  = require('./cache');

const TMDB_BASE        = 'https://api.themoviedb.org/3';
const IMAGE_BASE       = 'https://image.tmdb.org/t/p';
const ANIMATION_GENRE  = 16;  // TMDB genre ID for Animation

// ── Genre name → TMDB genre ID mappings ──────────────────────────────────────

const MOVIE_GENRE_IDS = {
  Action:    28,
  Comedy:    35,
  Adventure: 12,
  Family:    10751,
  Fantasy:   14,
  'Sci-Fi':  878,
};

const TV_GENRE_IDS = {
  Action:    10759,  // TMDB uses "Action & Adventure" for TV
  Comedy:    35,
  Adventure: 10759,
  Family:    10751,
  Fantasy:   10765,  // TMDB uses "Sci-Fi & Fantasy" for TV
  'Sci-Fi':  10765,
};

// ── HTTP client ───────────────────────────────────────────────────────────────

const http = axios.create({
  baseURL: TMDB_BASE,
  timeout: 10000,
});

/** Low-level GET. Injects the TMDB API key from the environment. */
async function tmdbGet(endpoint, params = {}) {
  const { data } = await http.get(endpoint, {
    params: { api_key: process.env.TMDB_API_KEY, ...params },
  });
  return data;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

/**
 * Returns cached value if present; otherwise runs fetchFn, stores the result,
 * and returns it.
 *
 * @param {string}   key      - Cache key
 * @param {Function} fetchFn  - Async function that produces the value
 * @param {number}   [ttl]    - Override TTL in seconds (omit to use default 6hr)
 */
async function cachedGet(key, fetchFn, ttl) {
  const hit = cache.get(key);
  if (hit !== undefined) {
    console.log(`[Cache] HIT  ${key}`);
    return hit;
  }

  console.log(`[Cache] MISS ${key}`);
  const result = await fetchFn();

  ttl !== undefined ? cache.set(key, result, ttl) : cache.set(key, result);
  return result;
}

// ── IMDB ID resolution ────────────────────────────────────────────────────────
// TMDB discover results don't include IMDB IDs, so we fetch them separately.
// These are cached for 24 hours because they essentially never change.

const IMDB_TTL = 24 * 3600;

async function getMovieImdbId(tmdbId) {
  return cachedGet(
    `imdb:movie:${tmdbId}`,
    async () => {
      try {
        const data = await tmdbGet(`/movie/${tmdbId}/external_ids`);
        return data.imdb_id || null;
      } catch {
        return null;  // silently skip movies without an IMDB ID
      }
    },
    IMDB_TTL
  );
}

async function getTvImdbId(tmdbId) {
  return cachedGet(
    `imdb:tv:${tmdbId}`,
    async () => {
      try {
        const data = await tmdbGet(`/tv/${tmdbId}/external_ids`);
        return data.imdb_id || null;
      } catch {
        return null;
      }
    },
    IMDB_TTL
  );
}

// ── Stremio meta formatters ───────────────────────────────────────────────────

function formatMovieMeta(movie, imdbId) {
  return {
    id:          imdbId,
    type:        'movie',
    name:        movie.title,
    poster:      movie.poster_path   ? `${IMAGE_BASE}/w500${movie.poster_path}`    : undefined,
    background:  movie.backdrop_path ? `${IMAGE_BASE}/w1280${movie.backdrop_path}` : undefined,
    description: movie.overview      || undefined,
    releaseInfo: movie.release_date  ? movie.release_date.slice(0, 4)             : undefined,
    imdbRating:  movie.vote_average  ? movie.vote_average.toFixed(1)              : undefined,
  };
}

function formatTvMeta(show, imdbId) {
  return {
    id:          imdbId,
    type:        'series',
    name:        show.name,
    poster:      show.poster_path    ? `${IMAGE_BASE}/w500${show.poster_path}`     : undefined,
    background:  show.backdrop_path  ? `${IMAGE_BASE}/w1280${show.backdrop_path}`  : undefined,
    description: show.overview       || undefined,
    releaseInfo: show.first_air_date ? show.first_air_date.slice(0, 4)            : undefined,
    imdbRating:  show.vote_average   ? show.vote_average.toFixed(1)               : undefined,
  };
}

// ── IMDB enrichment ───────────────────────────────────────────────────────────
// Resolve IMDB IDs for all items in parallel, then filter out those without one.

async function enrichMovies(movies) {
  const resolved = await Promise.all(
    movies.map(async (movie) => {
      const imdbId = await getMovieImdbId(movie.id);
      return imdbId && imdbId.startsWith('tt') ? formatMovieMeta(movie, imdbId) : null;
    })
  );
  return resolved.filter(Boolean);
}

async function enrichTvShows(shows) {
  const resolved = await Promise.all(
    shows.map(async (show) => {
      const imdbId = await getTvImdbId(show.id);
      return imdbId && imdbId.startsWith('tt') ? formatTvMeta(show, imdbId) : null;
    })
  );
  return resolved.filter(Boolean);
}

// ── Genre param builder ───────────────────────────────────────────────────────

function genresParam(genre, map) {
  return genre && map[genre]
    ? `${ANIMATION_GENRE},${map[genre]}`
    : String(ANIMATION_GENRE);
}

// ── Catalog fetchers ──────────────────────────────────────────────────────────
// Each function maps to one catalog in manifest.js.
// The `skip` extra from Stremio is converted to a TMDB page number.

/**
 * Popular animated movies — sorted by popularity, minimum vote threshold.
 */
async function getPopularAnimatedMovies({ genre, skip } = {}) {
  const page     = Math.floor(parseInt(skip || 0) / 20) + 1;
  const cacheKey = `cat:popular-movies:${genre || 'all'}:p${page}`;

  return cachedGet(cacheKey, async () => {
    const data = await tmdbGet('/discover/movie', {
      with_genres:      genresParam(genre, MOVIE_GENRE_IDS),
      sort_by:          'popularity.desc',
      'vote_count.gte': 100,
      page,
    });
    console.log(`[TMDB] discover/movie popular — page ${page}, raw results: ${data.results.length}`);
    return enrichMovies(data.results);
  });
}

/**
 * Classic cartoon movies — animated films released on or before 31 Dec 1995.
 */
async function getClassicCartoonMovies({ genre, skip } = {}) {
  const page     = Math.floor(parseInt(skip || 0) / 20) + 1;
  const cacheKey = `cat:classic-movies:${genre || 'all'}:p${page}`;

  return cachedGet(cacheKey, async () => {
    const data = await tmdbGet('/discover/movie', {
      with_genres:                  genresParam(genre, MOVIE_GENRE_IDS),
      sort_by:                      'popularity.desc',
      'primary_release_date.lte':   '1995-12-31',
      page,
    });
    console.log(`[TMDB] discover/movie classics — page ${page}, raw results: ${data.results.length}`);
    return enrichMovies(data.results);
  });
}

/**
 * Classic cartoon series — animated shows first aired on or before 31 Dec 1995.
 * Covers Scooby-Doo, Tom & Jerry, Looney Tunes, etc.
 */
async function getClassicCartoonSeries({ genre, skip } = {}) {
  const page     = Math.floor(parseInt(skip || 0) / 20) + 1;
  const cacheKey = `cat:classic-series:${genre || 'all'}:p${page}`;

  return cachedGet(cacheKey, async () => {
    const data = await tmdbGet('/discover/tv', {
      with_genres:              genresParam(genre, TV_GENRE_IDS),
      sort_by:                  'popularity.desc',
      'first_air_date.lte':     '1995-12-31',
      page,
    });
    console.log(`[TMDB] discover/tv classics — page ${page}, raw results: ${data.results.length}`);
    return enrichTvShows(data.results);
  });
}

/**
 * Current/popular animated series — sorted by popularity.
 */
async function getAnimatedSeries({ genre, skip } = {}) {
  const page     = Math.floor(parseInt(skip || 0) / 20) + 1;
  const cacheKey = `cat:animated-series:${genre || 'all'}:p${page}`;

  return cachedGet(cacheKey, async () => {
    const data = await tmdbGet('/discover/tv', {
      with_genres:      genresParam(genre, TV_GENRE_IDS),
      sort_by:          'popularity.desc',
      'vote_count.gte': 50,
      page,
    });
    console.log(`[TMDB] discover/tv series — page ${page}, raw results: ${data.results.length}`);
    return enrichTvShows(data.results);
  });
}

// ── Meta detail fetchers ──────────────────────────────────────────────────────

/**
 * Reverse-lookup: given an IMDB ID, find the TMDB item.
 * Used by the meta handler as the first step before fetching full details.
 */
async function findByImdbId(imdbId, type) {
  return cachedGet(
    `find:${imdbId}`,
    async () => {
      const data = await tmdbGet(`/find/${imdbId}`, { external_source: 'imdb_id' });
      if (type === 'movie') {
        return (data.movie_results && data.movie_results[0]) || null;
      }
      return (data.tv_results && data.tv_results[0]) || null;
    },
    IMDB_TTL
  );
}

/**
 * Full movie details — details + credits + videos fetched in parallel,
 * bundled into a single cache entry so subsequent meta calls are one lookup.
 */
async function getMovieDetails(tmdbId) {
  return cachedGet(`meta:movie:${tmdbId}`, async () => {
    const [details, credits, videos] = await Promise.all([
      tmdbGet(`/movie/${tmdbId}`),
      tmdbGet(`/movie/${tmdbId}/credits`),
      tmdbGet(`/movie/${tmdbId}/videos`),
    ]);
    return { details, credits, videos };
  });
}

/**
 * Full TV show details — same structure as getMovieDetails.
 */
async function getTvDetails(tmdbId) {
  return cachedGet(`meta:tv:${tmdbId}`, async () => {
    const [details, credits, videos] = await Promise.all([
      tmdbGet(`/tv/${tmdbId}`),
      tmdbGet(`/tv/${tmdbId}/credits`),
      tmdbGet(`/tv/${tmdbId}/videos`),
    ]);
    return { details, credits, videos };
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getPopularAnimatedMovies,
  getClassicCartoonMovies,
  getClassicCartoonSeries,
  getAnimatedSeries,
  findByImdbId,
  getMovieDetails,
  getTvDetails,
  IMAGE_BASE,
};
