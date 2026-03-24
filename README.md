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

## Setup

### 1 · Get a Free TMDB API Key

1. Create a free account at [themoviedb.org](https://www.themoviedb.org)
2. Go to **Settings → API**  →  [direct link](https://www.themoviedb.org/settings/api)
3. Click **Create** and choose **Developer**
4. Fill in the form (any website/app description is fine for personal use)
5. Copy the **API Key (v3 auth)** — it looks like `a1b2c3d4e5f6...`

### 2 · Install & Run Locally

```bash
# Clone or download the project
cd animvault

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Open .env in any editor and set:
#   TMDB_API_KEY=your_key_here

# Start the addon
npm start
```

The server starts at **http://localhost:7000**.

### 3 · Install in Stremio

1. Open **Stremio**
2. Click the **puzzle-piece icon** (Add-ons) in the top-right corner
3. Click **Community Add-ons**
4. Paste this URL into the search/install bar:
   ```
   http://localhost:7000/manifest.json
   ```
5. Click **Install**

> **Note:** The Stremio app and the addon server must be on the same machine for `localhost` to work. For remote access, deploy to a server — see below.

---

## Deployment

### Railway *(recommended — free tier available)*

1. Fork this repository to your GitHub account
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Select your fork
4. In **Variables**, add:
   ```
   TMDB_API_KEY = your_key_here
   ```
5. Railway auto-detects Node.js and deploys. You get a public URL like:
   `https://animvault-production.up.railway.app`
6. Install in Stremio with:
   ```
   https://animvault-production.up.railway.app/manifest.json
   ```

### Render

1. Create a **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repository
3. **Build command:** `npm install`
4. **Start command:** `npm start`
5. Add environment variable `TMDB_API_KEY` in the dashboard
6. Use the Render public URL as your manifest URL

### Vercel *(serverless — note below)*

```bash
npm install -g vercel
vercel
# Add TMDB_API_KEY in the Vercel dashboard → Settings → Environment Variables
```

> **Heads-up:** Vercel spins functions down after inactivity, which means the in-memory cache is lost between invocations. The addon will still work correctly but cold-start requests may be slower. Railway or Render are better fits for persistent in-memory caching.

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

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TMDB_API_KEY` | Yes | — | TMDB v3 API key |
| `PORT` | No | `7001` | HTTP port for the addon server |
| `YTS_BASE_URL` | No | `https://yts.mx` | YTS API base URL (change if domain moves) |
| `EZTV_BASE_URL` | No | `https://eztvx.to` | EZTV API base URL (change if domain moves) |

---

## Development

```bash
npm run dev   # nodemon — auto-restarts the server on file changes
```

---

## License

MIT
# Animvault
