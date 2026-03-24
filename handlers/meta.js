// handlers/meta.js
// Stremio meta handler — returns full metadata for a single title.
//
// Called when a user clicks on a title. The `id` is always an IMDB ID (tt*).
// We use TMDB's /find endpoint to reverse-lookup the TMDB item, then fetch
// full details (description, cast, runtime, trailer, rating, backdrop) in parallel.

const tmdb = require('../lib/tmdb');

module.exports = async function metaHandler({ type, id }) {
  console.log(`[Meta] ${type}/${id}`);

  try {
    // Step 1: resolve IMDB ID → TMDB item
    const tmdbItem = await tmdb.findByImdbId(id, type);
    if (!tmdbItem) {
      console.warn(`[Meta] No TMDB match for ${id}`);
      return { meta: null };
    }

    // Step 2: build full meta object based on type
    if (type === 'movie') {
      return buildMovieMeta(id, tmdbItem.id);
    }

    if (type === 'series') {
      return buildSeriesMeta(id, tmdbItem.id);
    }

    return { meta: null };
  } catch (err) {
    console.error(`[Meta] Error for ${id}:`, err.message);
    return { meta: null };
  }
};

// ── Movie ─────────────────────────────────────────────────────────────────────

async function buildMovieMeta(imdbId, tmdbId) {
  const { details, credits, videos } = await tmdb.getMovieDetails(tmdbId);

  const trailer   = pickTrailer(videos.results);
  const cast      = (credits.cast || []).slice(0, 10).map((c) => c.name);
  const directors = (credits.crew || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);

  const meta = {
    id:          imdbId,
    type:        'movie',
    name:        details.title,
    poster:      img(details.poster_path,   'w500'),
    background:  img(details.backdrop_path, 'w1280'),
    description: details.overview     || undefined,
    releaseInfo: year(details.release_date),
    runtime:     details.runtime       ? `${details.runtime} min` : undefined,
    imdbRating:  rating(details.vote_average),
    genres:      (details.genres || []).map((g) => g.name),
    cast,
    director:    directors,
    trailers:    trailerObjects(trailer),
    links:       trailerLinks(trailer),
  };

  console.log(`[Meta] Resolved movie: ${details.title} (${imdbId})`);
  return { meta, cacheMaxAge: 3600 };
}

// ── Series ────────────────────────────────────────────────────────────────────

async function buildSeriesMeta(imdbId, tmdbId) {
  const { details, credits, videos } = await tmdb.getTvDetails(tmdbId);

  const trailer = pickTrailer(videos.results);
  const cast    = (credits.cast || []).slice(0, 10).map((c) => c.name);

  const meta = {
    id:          imdbId,
    type:        'series',
    name:        details.name,
    poster:      img(details.poster_path,   'w500'),
    background:  img(details.backdrop_path, 'w1280'),
    description: details.overview       || undefined,
    releaseInfo: year(details.first_air_date),
    runtime:
      details.episode_run_time && details.episode_run_time.length
        ? `${details.episode_run_time[0]} min`
        : undefined,
    imdbRating:  rating(details.vote_average),
    genres:      (details.genres || []).map((g) => g.name),
    cast,
    trailers:    trailerObjects(trailer),
    links:       trailerLinks(trailer),
  };

  console.log(`[Meta] Resolved series: ${details.name} (${imdbId})`);
  return { meta, cacheMaxAge: 3600 };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const IMAGE_BASE = 'https://image.tmdb.org/t/p';

function img(path, size) {
  return path ? `${IMAGE_BASE}/${size}${path}` : undefined;
}

function year(dateStr) {
  return dateStr ? dateStr.slice(0, 4) : undefined;
}

function rating(avg) {
  return avg ? avg.toFixed(1) : undefined;
}

/**
 * Pick the best trailer from a TMDB video result array.
 * Prefers: YouTube > official > Trailer type > Teaser type.
 */
function pickTrailer(videos) {
  if (!videos || !videos.length) return null;

  const yt = videos.filter((v) => v.site === 'YouTube');
  if (!yt.length) return null;

  return yt.sort((a, b) => {
    // Official trailers first
    if (a.type === 'Trailer' && b.type !== 'Trailer') return -1;
    if (a.type !== 'Trailer' && b.type === 'Trailer') return  1;
    if (a.official && !b.official) return -1;
    if (!a.official && b.official) return  1;
    return 0;
  })[0];
}

function trailerObjects(trailer) {
  return trailer ? [{ source: trailer.key, type: 'Trailer' }] : [];
}

function trailerLinks(trailer) {
  return trailer
    ? [{
        name:     'Trailer',
        category: 'Trailer',
        url:      `https://www.youtube.com/watch?v=${trailer.key}`,
      }]
    : [];
}
