import api from '~/utils/api'

export interface PgcEpisodeVideoIds {
  aid: number
  bvid?: string
}

const episodeVideoIds = new Map<number, PgcEpisodeVideoIds>()
const episodeVideoIdRequests = new Map<number, Promise<PgcEpisodeVideoIds | undefined>>()

function findEpisode(result: any, epid: number) {
  const episodes = [
    ...(Array.isArray(result?.episodes) ? result.episodes : []),
    ...(Array.isArray(result?.section)
      ? result.section.flatMap((section: any) => Array.isArray(section?.episodes) ? section.episodes : [])
      : []),
  ]
  return episodes.find((episode: any) => Number(episode?.id ?? episode?.ep_id) === epid)
}

export async function resolvePgcEpisodeVideoIds(epid: number): Promise<PgcEpisodeVideoIds | undefined> {
  const cached = episodeVideoIds.get(epid)
  if (cached)
    return cached

  const pending = episodeVideoIdRequests.get(epid)
  if (pending)
    return pending

  const request = api.anime.getAnimeDetail({ ep_id: epid })
    .then((response) => {
      if (response.code !== 0)
        return undefined

      const episode = findEpisode(response.result ?? response.data, epid)
      const aid = Number(episode?.aid || 0)
      if (!aid)
        return undefined

      const ids = {
        aid,
        bvid: typeof episode?.bvid === 'string' && episode.bvid ? episode.bvid : undefined,
      }
      episodeVideoIds.set(epid, ids)
      return ids
    })
    .catch(() => undefined)
    .finally(() => episodeVideoIdRequests.delete(epid))

  episodeVideoIdRequests.set(epid, request)
  return request
}
