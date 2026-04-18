import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const BASE = 'https://embed.nowfar.lol/api';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const { tmdbId } = ctx.media;
  ctx.progress(10);
  const apiUrl = ctx.media.type === 'movie'
    ? `${BASE}/streams/showbox/movie/${tmdbId}`
    : `${BASE}/streams/showbox/tv/${tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
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

export const showboxScraper2 = makeSourcerer({
  id: 'showbox2',
  name: 'ShowBox 📦',
  rank: 910,
  disabled: false,
  flags: ['cors-allowed' as any],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});