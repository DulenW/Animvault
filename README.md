# AnimVault — Stremio Addon for Animation

A Stremio addon that surfaces animated movies, classic cartoons, and animated TV series, all curated from [The Movie Database (TMDB)](https://www.themoviedb.org).

## Catalogs

| Catalog | Type | Description |
|---------|------|-------------|
| **Popular Animation** | Movie | Trending animated films, sorted by popularity |
| **Classic Cartoons** | Movie | Animated films released on or before 1995 |
| **Classic Cartoons** | Series | Classic animated shows — Scooby-Doo, Tom & Jerry, Looney Tunes, etc. |
| **Animated Series** | Series | Popular current and recent cartoon series |

All catalogs support **genre filtering** (Action, Comedy, Adventure, Family, Fantasy, Sci-Fi) and **pagination** via the scroll-to-load-more behaviour in Stremio.

---

## Streams

AnimVault provides torrent streams via two sources:

| Source | Content | How it works |
|--------|---------|-------------|
| **YTS** | Movies | Searches by IMDB ID, returns multiple quality options (720p, 1080p, 2160p) |
| **EZTV** | TV Series | Fetches all episodes for a show, filters to the requested season/episode |

Stremio's built-in torrent engine plays these directly — no extra software needed.

> **Tip:** For broader stream coverage, install [Torrentio](https://torrentio.strem.fun/) alongside AnimVault. Stremio combines streams from all installed addons automatically.

---

## Project Structure

```
animvault/
├── index.js              # Entry point — builds the addon and starts the HTTP server
├── manifest.js           # Addon identity, catalog definitions, supported resources
├── handlers/
│   ├── catalog.js        # Returns lists of titles for each catalog
│   ├── meta.js           # Returns full metadata for a single title
│   └── stream.js         # Returns torrent streams from YTS (movies) and EZTV (series)
├── lib/
│   ├── tmdb.js           # TMDB API wrapper — all outbound requests + caching
│   ├── torrent.js        # Torrent API wrapper — YTS + EZTV with caching
│   └── cache.js          # node-cache instance (6 hr default TTL, 24 hr for ID maps)
├── package.json
├── .env.example          # Environment variable template
└── README.md
```

---

## Caching Strategy

| Data | TTL | Why |
|------|-----|-----|
| Catalog pages (discover results) | 6 hours | TMDB popularity changes slowly |
| Full metadata bundles | 6 hours | Cast, trailers, descriptions are stable |
| TMDB → IMDB ID mappings | 24 hours | These never change once assigned |
| Torrent search results | 1 hour | Torrent availability changes more frequently |

All caching is in-memory via `node-cache`. On first run a catalog page may take a few seconds while IMDB IDs are resolved in parallel. Subsequent requests for the same page are instant.

## Development

```bash
npm run dev   # nodemon — auto-restarts the server on file changes
```

---

## License

MIT
# Animvault
