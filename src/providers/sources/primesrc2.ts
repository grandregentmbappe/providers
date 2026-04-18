import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const BASE = 'https://embed.nowfar.lol/api';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const { tmdbId } = ctx.media;
  ctx.progress(10);
  const apiUrl = ctx.media.type === 'movie'
    ? `${BASE}/streams/primesrc/movie/${tmdbId}`
    : `${BASE}/streams/primesrc/tv/${tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
  const data = await ctx.fetcher<any>(apiUrl);
  ctx.progress(60);
  if (!data?.streams?.length) throw new NotFoundError('No streams');
  ctx.progress(90);
  return {
    embeds: [],
    stream: data.streams.map((s: any) => ({
      id: s.name || 'primary',
      type: 'hls' as const,
      playlist: s.url,
      captions: [],
      flags: ['cors-allowed' as any],
      headers: s.headers || {},
    })),
  };
}

export const primeSrcScraper = makeSourcerer({
  id: 'primesrc2',
  name: 'PrimeSrc',
  rank: 820,
  disabled: false,
  flags: ['cors-allowed' as any],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});