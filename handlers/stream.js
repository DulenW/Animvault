// handlers/stream.js
// Stremio stream handler — returns playable torrent streams for a title.
//
// Movies:  queries YTS by IMDB ID
// Series:  queries EZTV by IMDB ID, filters to the requested season+episode
//
// Stremio's built-in torrent engine streams directly from the returned infoHash.

const torrent = require('../lib/torrent');

module.exports = async function streamHandler({ type, id }) {
  console.log(`[Stream] ${type}/${id}`);

  try {
    if (type === 'movie') {
      const streams = await torrent.searchMovieTorrents(id);
      console.log(`[Stream] ${id} → ${streams.length} streams`);
      return { streams, cacheMaxAge: 3600 };
    }

    if (type === 'series') {
      const [imdbId, season, episode] = id.split(':');
      if (!imdbId || !season || !episode) {
        console.warn(`[Stream] Invalid series id format: ${id}`);
        return { streams: [] };
      }

      const streams = await torrent.searchEpisodeTorrents(imdbId, season, episode);
      console.log(`[Stream] ${imdbId} S${season}E${episode} → ${streams.length} streams`);
      return { streams, cacheMaxAge: 3600 };
    }

    return { streams: [] };
  } catch (err) {
    console.error(`[Stream] Error for ${id}:`, err.message);
    return { streams: [] };
  }
};
