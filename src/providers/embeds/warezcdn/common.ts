import { EmbedScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

export const warezcdnPlayerBase = 'https://warezcdn.com/player';

function decrypt(input: string) {
  let output = atob(input);
  output = output.trim();
  output = output.split('').reverse().join('');
  let last = output.slice(-5);
  last = last.split('').reverse().join('');
  output = output.slice(0, -5);
  return `${output}${last}`;
}

export async function getDecryptedId(ctx: EmbedScrapeContext) {
  const page = await ctx.proxiedFetcher<string>(`/player.php?${new URLSearchParams({ id: ctx.url })}`, {
    baseUrl: warezcdnPlayerBase,
    headers: {
      Referer: `${warezcdnPlayerBase}/getEmbed.php?${new URLSearchParams({
        id: ctx.url,
        sv: 'warezcdn',
      })}`,
    },
  });
  const allowanceKey = page.match(/let allowanceKey = "(.*?)";/)?.[1];
  if (!allowanceKey) throw new NotFoundError('Failed to get allowanceKey');

  const streamData = await ctx.proxiedFetcher('/functions.php', {
    baseUrl: warezcdnPlayerBase,
    method: 'POST',
    body: new URLSearchParams({
      getVideo: ctx.url,
      key: allowanceKey,
    }),
  });
  const stream = JSON.parse(streamData);

  if (!stream.id) throw new NotFoundError("can't get stream id");

  const decryptedId = decrypt(stream.id);

  if (!decryptedId) throw new NotFoundError("can't get file id");

  return decryptedId;
}
