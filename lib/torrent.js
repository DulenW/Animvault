// lib/torrent.js
// Torrent stream aggregator. Queries multiple sources in parallel and merges
// results into a deduplicated, quality-sorted list of Stremio stream objects.
//
// Sources:
//   Movies  → YTS + ThePirateBay + Torrent-CSV (all in parallel)
//   Series  → EZTV + ThePirateBay + Torrent-CSV (all in parallel)

const axios = require('axios');
const cache = require('./cache');
const tmdb  = require('./tmdb');

// ── Configuration ─────────────────────────────────────────────────────────────

const YTS_BASE  = process.env.YTS_BASE_URL  || 'https://yts.bz';
const EZTV_BASE = process.env.EZTV_BASE_URL || 'https://eztvx.to';
const TPB_BASE  = process.env.TPB_BASE_URL  || 'https://apibay.org';
const TCSV_BASE = process.env.TCSV_BASE_URL || 'https://torrents-csv.com';

const TORRENT_TTL  = 60 * 60; // 1 hour cache for torrent results
const HTTP_TIMEOUT = 8000;    // 8s — fail fast so Stremio doesn't hang

// Public trackers included in every stream for better peer discovery
const TRACKERS = [
  'tracker:udp://tracker.opentrackr.org:1337/announce',
  'tracker:udp://open.stealth.si:80/announce',
  'tracker:udp://tracker.torrent.eu.org:451/announce',
  'tracker:udp://open.demonii.com:1337/announce',
  'tracker:udp://explodie.org:6969/announce',
  'tracker:udp://tracker.openbittorrent.com:6969/announce',
  'tracker:udp://exodus.desync.com:6969/announce',
  'tracker:udp://tracker.tiny-vps.com:6969/announce',
  'tracker:udp://tracker.moeking.me:6969/announce',
  'tracker:udp://open.tracker.cl:1337/announce',
  'tracker:udp://p4p.arenabg.com:1337/announce',
  'tracker:udp://tracker.dler.org:6969/announce',
];

// Quality ranking for sort order (higher = better) — sub-720p excluded
const QUALITY_RANK = { '2160p': 4, '1080p': 3, '720p': 2 };

// Minimum seeds for a stream to be worth showing (0-seed = never plays)
const MIN_SEEDS = 2;

// Low-quality source types always excluded regardless of resolution tag
const LOW_QUALITY_SOURCES = /\b(TELESYNC|TS|CAM)\b/i;

// Minimum file size to consider (filters out subtitle files, NFOs, etc.)
const MIN_MOVIE_SIZE   = 100 * 1024 * 1024; // 100 MB
const MIN_EPISODE_SIZE = 50  * 1024 * 1024;  // 50 MB

// ── HTTP clients ──────────────────────────────────────────────────────────────

const ytsHttp  = axios.create({ baseURL: YTS_BASE,  timeout: HTTP_TIMEOUT });
const eztvHttp = axios.create({ baseURL: EZTV_BASE, timeout: HTTP_TIMEOUT });
const tpbHttp  = axios.create({ baseURL: TPB_BASE,  timeout: HTTP_TIMEOUT });
const tcsvHttp = axios.create({ baseURL: TCSV_BASE, timeout: HTTP_TIMEOUT });

// ── Cache helper ──────────────────────────────────────────────────────────────

async function cachedGet(key, fetchFn) {
  const hit = cache.get(key);
  if (hit !== undefined) {
    console.log(`[Torrent][Cache] HIT  ${key}`);
    return hit;
  }
  console.log(`[Torrent][Cache] MISS ${key}`);
  const result = await fetchFn();
  cache.set(key, result, TORRENT_TTL);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API — these are the two exported functions, unchanged signatures
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search all movie sources in parallel, merge, deduplicate, sort.
 */
async function searchMovieTorrents(imdbId) {
  return cachedGet(`torrent:movie:${imdbId}`, async () => {
    const [yts, tpb, tcsv] = await Promise.all([
      fetchYTSMovies(imdbId),
      fetchTPBMovies(imdbId),
      fetchTCSVMovies(imdbId),
    ]);

    const all = [...yts, ...tpb, ...tcsv];
    console.log(`[Torrent] Movie ${imdbId}: YTS=${yts.length} TPB=${tpb.length} TCSV=${tcsv.length} → ${all.length} total`);
    return sortStreams(deduplicateByInfoHash(all));
  });
}

/**
 * Search all series sources in parallel, merge, deduplicate, sort.
 */
async function searchEpisodeTorrents(imdbId, season, episode) {
  return cachedGet(`torrent:ep:${imdbId}:${season}:${episode}`, async () => {
    const [eztv, tpb, tcsv] = await Promise.all([
      fetchEZTVEpisode(imdbId, season, episode),
      fetchTPBEpisodes(imdbId, season, episode),
      fetchTCSVEpisodes(imdbId, season, episode),
    ]);

    const all = [...eztv, ...tpb, ...tcsv];
    console.log(`[Torrent] Series ${imdbId} S${season}E${episode}: EZTV=${eztv.length} TPB=${tpb.length} TCSV=${tcsv.length} → ${all.length} total`);
    return sortStreams(deduplicateByInfoHash(all));
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE: YTS (movies only)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchYTSMovies(imdbId) {
  try {
    const { data } = await ytsHttp.get('/api/v2/list_movies.json', {
      params: { query_term: imdbId, limit: 1 },
    });

    const movies = data?.data?.movies;
    if (!movies || !movies.length) {
      console.log(`[YTS] No results for ${imdbId}`);
      return [];
    }

    const torrents = (movies[0].torrents || []).filter((t) =>
      t.quality !== '480p' && !LOW_QUALITY_SOURCES.test(t.type || '')
    );
    console.log(`[YTS] ${imdbId} → ${torrents.length} torrents`);

    return torrents.map((t) => {
      const quality = t.quality || '';
      const type    = t.type    || '';
      return {
        infoHash: t.hash.toLowerCase(),
        name:     'AnimVault',
        title:    `${quality} ${type}\n👤 ${t.seeds || 0}  💾 ${t.size || '?'}`,
        sources:  TRACKERS,
        _quality: quality,
      };
    });
  } catch (err) {
    console.error(`[YTS] Error for ${imdbId}:`, err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE: EZTV (series only)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchEZTVEpisode(imdbId, season, episode) {
  const numericId  = imdbId.replace(/^tt/, '');
  const seasonNum  = parseInt(season, 10);
  const episodeNum = parseInt(episode, 10);

  try {
    // EZTV returns all episodes for the show — fetch + cache per show
    const allTorrents = await fetchAllEztvTorrents(imdbId, numericId);

    const matches = allTorrents.filter((t) => {
      return (
        parseInt(t.season, 10) === seasonNum &&
        parseInt(t.episode, 10) === episodeNum &&
        !LOW_QUALITY_SOURCES.test(t.filename || t.title || '')
      );
    });

    console.log(`[EZTV] ${imdbId} S${season}E${episode} → ${matches.length} matching`);

    return matches.map((t) => {
      const quality = parseQuality(t.filename || t.title || '');
      return {
        infoHash: (t.hash || '').toLowerCase(),
        name:     'AnimVault',
        title:    `S${t.season}E${t.episode} ${quality}\n👤 ${t.seeds || 0}  💾 ${formatBytes(t.size_bytes)}`,
        sources:  TRACKERS,
        behaviorHints: { bingeGroup: `animvault-${t.imdb_id || 'series'}` },
        _quality: quality,
      };
    });
  } catch (err) {
    console.error(`[EZTV] Error for ${imdbId}:`, err.message);
    return [];
  }
}

async function fetchAllEztvTorrents(imdbId, numericId) {
  const cacheKey = `torrent:eztv-all:${imdbId}`;

  return cachedGet(cacheKey, async () => {
    const allTorrents = [];
    const MAX_PAGES = 3;

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { data } = await eztvHttp.get('/api/get-torrents', {
          params: { imdb_id: numericId, limit: 100, page },
        });

        const torrents = data?.torrents;
        if (!torrents || !torrents.length) break;

        allTorrents.push(...torrents);

        const total = data.torrents_count || 0;
        if (allTorrents.length >= total) break;
      }
    } catch (err) {
      console.error(`[EZTV] Fetch error for ${imdbId}:`, err.message);
    }

    console.log(`[EZTV] ${imdbId} → ${allTorrents.length} total torrents`);
    return allTorrents;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE: ThePirateBay via apibay.org (movies + series)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search TPB for movie torrents. Tries IMDB ID first, falls back to title search.
 */
async function fetchTPBMovies(imdbId) {
  try {
    // Try IMDB ID search first (movie categories: 201=Movies, 207=HD Movies)
    let results = await tpbQuery(imdbId, '201,207');

    // If IMDB search found nothing, fall back to title search via TMDB
    if (!results.length) {
      const item = await tmdb.findByImdbId(imdbId, 'movie');
      if (item?.title) {
        console.log(`[TPB] IMDB miss, trying title: "${item.title}"`);
        results = await tpbQuery(item.title, '201,207');
      }
    }

    // Filter out tiny files and low-quality sources
    results = results.filter((t) =>
      parseInt(t.size || '0', 10) >= MIN_MOVIE_SIZE && !LOW_QUALITY_SOURCES.test(t.name || '')
    );
    console.log(`[TPB] Movies ${imdbId} → ${results.length} results (after size filter)`);
    return results.map(formatTPBStream);
  } catch (err) {
    console.error(`[TPB] Movie error for ${imdbId}:`, err.message);
    return [];
  }
}

/**
 * Search TPB for series episode torrents. Parses S##E## from torrent names.
 */
async function fetchTPBEpisodes(imdbId, season, episode) {
  try {
    let results = await tpbQuery(imdbId);

    // Fall back to title search if IMDB search found nothing
    if (!results.length) {
      const item = await tmdb.findByImdbId(imdbId, 'series');
      if (item?.name) {
        const query = `${item.name} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        console.log(`[TPB] IMDB miss, trying: "${query}"`);
        results = await tpbQuery(query);
      }
    }

    // Filter to the requested episode
    const seasonNum  = parseInt(season, 10);
    const episodeNum = parseInt(episode, 10);
    const episodeRegex = new RegExp(`S0*${seasonNum}E0*${episodeNum}(?!\\d)`, 'i');

    const matches = results.filter((t) =>
      episodeRegex.test(t.name) &&
      parseInt(t.size || '0', 10) >= MIN_EPISODE_SIZE &&
      !LOW_QUALITY_SOURCES.test(t.name || '')
    );

    console.log(`[TPB] Series ${imdbId} S${season}E${episode} → ${matches.length} matching`);
    return matches.map((t) => {
      const stream = formatTPBStream(t);
      stream.behaviorHints = { bingeGroup: `animvault-${imdbId}` };
      return stream;
    });
  } catch (err) {
    console.error(`[TPB] Series error for ${imdbId}:`, err.message);
    return [];
  }
}

/**
 * Low-level TPB API call. Handles the no-results sentinel.
 */
async function tpbQuery(query, cat) {
  const params = { q: query };
  if (cat) params.cat = cat;

  const { data } = await tpbHttp.get('/q.php', { params });

  // TPB returns [{id:"0", name:"No results returned"}] instead of []
  if (!Array.isArray(data) || data[0]?.id === '0') return [];

  return data;
}

function formatTPBStream(t) {
  const quality = parseQuality(t.name || '');
  const seeds   = parseInt(t.seeders || '0', 10);
  const size    = formatBytes(parseInt(t.size || '0', 10));

  return {
    infoHash: (t.info_hash || '').toLowerCase(),
    name:     'AnimVault',
    title:    `${quality || 'TPB'}\n👤 ${seeds}  💾 ${size}`,
    sources:  TRACKERS,
    _quality: quality,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE: Torrent-CSV (movies only — no IMDB support, uses title search)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchTCSVMovies(imdbId) {
  try {
    // Resolve IMDB ID to movie title via TMDB (already cached from catalog browsing)
    const item = await tmdb.findByImdbId(imdbId, 'movie');
    if (!item?.title) {
      console.log(`[TCSV] Could not resolve title for ${imdbId}`);
      return [];
    }

    const { data } = await tcsvHttp.get('/service/search', {
      params: { q: item.title, size: 20 },
    });

    const torrents = (data?.torrents || []).filter((t) =>
      t.size_bytes >= MIN_MOVIE_SIZE && !LOW_QUALITY_SOURCES.test(t.name || '')
    );
    console.log(`[TCSV] "${item.title}" → ${torrents.length} results (after size filter)`);

    return torrents.map((t) => {
      const quality = parseQuality(t.name || '');
      return {
        infoHash: t.infohash, // already lowercase
        name:     'AnimVault',
        title:    `${quality || 'TCSV'}\n👤 ${t.seeders || 0}  💾 ${formatBytes(t.size_bytes)}`,
        sources:  TRACKERS,
        _quality: quality,
      };
    });
  } catch (err) {
    console.error(`[TCSV] Error for ${imdbId}:`, err.message);
    return [];
  }
}

async function fetchTCSVEpisodes(imdbId, season, episode) {
  try {
    const item = await tmdb.findByImdbId(imdbId, 'series');
    if (!item?.name) {
      console.log(`[TCSV] Could not resolve series title for ${imdbId}`);
      return [];
    }

    const query = `${item.name} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    const { data } = await tcsvHttp.get('/service/search', {
      params: { q: query, size: 20 },
    });

    const torrents = (data?.torrents || []).filter((t) =>
      t.size_bytes >= MIN_EPISODE_SIZE && !LOW_QUALITY_SOURCES.test(t.name || '')
    );
    console.log(`[TCSV] "${query}" → ${torrents.length} results (after size filter)`);

    return torrents.map((t) => {
      const quality = parseQuality(t.name || '');
      return {
        infoHash: t.infohash,
        name:     'AnimVault',
        title:    `${quality || 'TCSV'}\n👤 ${t.seeders || 0}  💾 ${formatBytes(t.size_bytes)}`,
        sources:  TRACKERS,
        behaviorHints: { bingeGroup: `animvault-${imdbId}` },
        _quality: quality,
      };
    });
  } catch (err) {
    console.error(`[TCSV] Series error for ${imdbId}:`, err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Extract quality tag from a torrent name/filename. */
function parseQuality(filename) {
  const resolution = filename.match(/\b(2160p|1080p|720p)\b/i);
  const source     = filename.match(/\b(BluRay|WEB-DL|WEBRip|HDTV|BDRip|BRRip|DVDRip)\b/i);

  const parts = [];
  if (resolution) parts.push(resolution[1]);
  if (source)     parts.push(source[1]);

  return parts.length ? parts.join(' ') : '';
}

/** Format bytes into human-readable size. */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '?';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

/**
 * Remove duplicate infoHashes, keeping the entry with more seeds.
 */
function deduplicateByInfoHash(streams) {
  const map = new Map();
  for (const s of streams) {
    if (!s.infoHash) continue;
    const existing = map.get(s.infoHash);
    if (!existing) {
      map.set(s.infoHash, s);
    } else {
      const existingSeeds = parseInt(existing.title.match(/👤\s*(\d+)/)?.[1] || '0', 10);
      const newSeeds      = parseInt(s.title.match(/👤\s*(\d+)/)?.[1] || '0', 10);
      if (newSeeds > existingSeeds) map.set(s.infoHash, s);
    }
  }
  return Array.from(map.values());
}

/** Sort streams: highest quality first, then by seed count descending. */
function sortStreams(streams) {
  return streams
    .filter((s) => {
      // Reject any explicitly sub-720p resolution (safety net for sources that bypass per-fetch filters)
      const res = s._quality?.match(/\d{3,4}p/)?.[0];
      if (res && QUALITY_RANK[res] === undefined) return false;
      // Reject dead/near-dead torrents
      const seeds = parseInt(s.title.match(/👤\s*(\d+)/)?.[1] || '0', 10);
      return seeds >= MIN_SEEDS;
    })
    .sort((a, b) => {
      const rankA = QUALITY_RANK[a._quality?.match(/\d{3,4}p/)?.[0]] || 0;
      const rankB = QUALITY_RANK[b._quality?.match(/\d{3,4}p/)?.[0]] || 0;
      if (rankB !== rankA) return rankB - rankA;
      const seedsA = parseInt(a.title.match(/👤\s*(\d+)/)?.[1] || '0', 10);
      const seedsB = parseInt(b.title.match(/👤\s*(\d+)/)?.[1] || '0', 10);
      return seedsB - seedsA;
    })
    .map(({ _quality, ...stream }) => stream); // strip internal field
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  searchMovieTorrents,
  searchEpisodeTorrents,
};
