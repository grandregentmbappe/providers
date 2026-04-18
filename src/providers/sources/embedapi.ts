import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const EMBED_API_BASE = 'https://embed.nowfar.lol/api';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const { tmdbId } = ctx.media;
  ctx.progress(10);

  const apiUrl =
    ctx.media.type === 'movie'
      ? `${EMBED_API_BASE}/streams/movie/${tmdbId}`
      : `${EMBED_API_BASE}/streams/tv/${tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;

  const data = await ctx.fetcher<any>(apiUrl);

  ctx.progress(60);

  if (!data?.streams || data.streams.length === 0) throw new NotFoundError('No streams from embed API');

  ctx.progress(90);

  return {
    embeds: [],
    stream: data.streams.map((s: any) => ({
      id: s.name || 'primary',
      type: 'file',
      qualities: {
        unknown: {
          type: 'hls',
          url: s.url,
        },
      },
      captions: [],
      flags: [],
      headers: s.headers || {},
    })),
  };
}

export const embedApiScraper = makeSourcerer({
  id: 'embedapi',
  name: 'nowfar.lol api🔥',
  rank: 900,
  disabled: false,
  flags: [],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});