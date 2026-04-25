(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports, require("cheerio"), require("unpacker"), require("iso-639-1"), require("crypto-js"), require("form-data")) : typeof define === "function" && define.amd ? define(["exports", "cheerio", "unpacker", "iso-639-1", "crypto-js", "form-data"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.index = {}, global.cheerio, global.unpacker, global["iso-639-1"], global["crypto-js"], global["form-data"]));
})(this, function(exports2, cheerio, unpacker, ISO6391, CryptoJS, FormData) {
  "use strict";
  function _interopNamespaceDefault(e) {
    const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
    if (e) {
      for (const k in e) {
        if (k !== "default") {
          const d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: () => e[k]
          });
        }
      }
    }
    n.default = e;
    return Object.freeze(n);
  }
  const cheerio__namespace = /* @__PURE__ */ _interopNamespaceDefault(cheerio);
  const unpacker__namespace = /* @__PURE__ */ _interopNamespaceDefault(unpacker);
  class NotFoundError extends Error {
    constructor(reason) {
      super(`Couldn't find a stream: ${reason ?? "not found"}`);
      this.name = "NotFoundError";
    }
  }
  function formatSourceMeta(v) {
    const types = [];
    if (v.scrapeMovie) types.push("movie");
    if (v.scrapeShow) types.push("show");
    return {
      type: "source",
      id: v.id,
      rank: v.rank,
      name: v.name,
      flags: v.flags,
      mediaTypes: types
    };
  }
  function formatEmbedMeta(v) {
    return {
      type: "embed",
      id: v.id,
      rank: v.rank,
      name: v.name,
      flags: v.flags
    };
  }
  function getAllSourceMetaSorted(list) {
    return list.sources.sort((a, b) => b.rank - a.rank).map(formatSourceMeta);
  }
  function getAllEmbedMetaSorted(list) {
    return list.embeds.sort((a, b) => b.rank - a.rank).map(formatEmbedMeta);
  }
  function getSpecificId(list, id) {
    const foundSource = list.sources.find((v) => v.id === id);
    if (foundSource) {
      return formatSourceMeta(foundSource);
    }
    const foundEmbed = list.embeds.find((v) => v.id === id);
    if (foundEmbed) {
      return formatEmbedMeta(foundEmbed);
    }
    return null;
  }
  function makeFullUrl(url, ops) {
    let leftSide = (ops == null ? void 0 : ops.baseUrl) ?? "";
    let rightSide = url;
    if (leftSide.length > 0 && !leftSide.endsWith("/")) leftSide += "/";
    if (rightSide.startsWith("/")) rightSide = rightSide.slice(1);
    const fullUrl = leftSide + rightSide;
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://") && !fullUrl.startsWith("data:"))
      throw new Error(`Invald URL -- URL doesn't start with a http scheme: '${fullUrl}'`);
    const parsedUrl = new URL(fullUrl);
    Object.entries((ops == null ? void 0 : ops.query) ?? {}).forEach(([k, v]) => {
      parsedUrl.searchParams.set(k, v);
    });
    return parsedUrl.toString();
  }
  function makeFetcher(fetcher) {
    const newFetcher = (url, ops) => {
      return fetcher(url, {
        headers: (ops == null ? void 0 : ops.headers) ?? {},
        method: (ops == null ? void 0 : ops.method) ?? "GET",
        query: (ops == null ? void 0 : ops.query) ?? {},
        baseUrl: (ops == null ? void 0 : ops.baseUrl) ?? "",
        readHeaders: (ops == null ? void 0 : ops.readHeaders) ?? [],
        body: ops == null ? void 0 : ops.body,
        credentials: ops == null ? void 0 : ops.credentials
      });
    };
    const output = async (url, ops) => (await newFetcher(url, ops)).body;
    output.full = newFetcher;
    return output;
  }
  const flags = {
    // CORS are set to allow any origin
    CORS_ALLOWED: "cors-allowed",
    // the stream is locked on IP, so only works if
    // request maker is same as player (not compatible with proxies)
    IP_LOCKED: "ip-locked",
    // The source/embed is blocking cloudflare ip's
    // This flag is not compatible with a proxy hosted on cloudflare
    CF_BLOCKED: "cf-blocked",
    // Streams and sources with this flag wont be proxied
    // And will be exclusive to the extension
    PROXY_BLOCKED: "proxy-blocked",
    // The stream is MKV format and requires a player that supports it.
    // Most browsers cannot play MKV; native/desktop/mobile apps with proper players can.
    MKV_REQUIRED: "mkv-required"
  };
  const targets = {
    // browser with CORS restrictions
    BROWSER: "browser",
    // browser, but no CORS restrictions through a browser extension
    BROWSER_EXTENSION: "browser-extension",
    // native app, so no restrictions in what can be played
    NATIVE: "native",
    // any target, no target restrictions
    ANY: "any"
  };
  const targetToFeatures = {
    browser: {
      requires: [flags.CORS_ALLOWED],
      disallowed: [flags.MKV_REQUIRED]
    },
    "browser-extension": {
      requires: [],
      disallowed: [flags.MKV_REQUIRED]
    },
    native: {
      requires: [],
      disallowed: []
    },
    any: {
      requires: [],
      disallowed: [flags.MKV_REQUIRED]
    }
  };
  function getTargetFeatures(target, consistentIpForRequests, proxyStreams) {
    const features = targetToFeatures[target];
    if (!consistentIpForRequests) features.disallowed.push(flags.IP_LOCKED);
    if (proxyStreams) features.disallowed.push(flags.PROXY_BLOCKED);
    return features;
  }
  function flagsAllowedInFeatures(features, inputFlags) {
    const hasAllFlags = features.requires.every((v) => inputFlags.includes(v));
    if (!hasAllFlags) return false;
    const hasDisallowedFlag = features.disallowed.some((v) => inputFlags.includes(v));
    if (hasDisallowedFlag) return false;
    return true;
  }
  const DEFAULT_PROXY_URL = "https://proxy.example.com";
  let CONFIGURED_M3U8_PROXY_URL = "https://proxy.example.com";
  function setM3U8ProxyUrl(proxyUrl) {
    CONFIGURED_M3U8_PROXY_URL = proxyUrl;
  }
  function getM3U8ProxyUrl() {
    return CONFIGURED_M3U8_PROXY_URL;
  }
  function requiresProxy(stream) {
    if (!stream.flags.includes(flags.CORS_ALLOWED) || !!(stream.headers && Object.keys(stream.headers).length > 0))
      return true;
    return false;
  }
  function setupProxy(stream) {
    const headers2 = stream.headers && Object.keys(stream.headers).length > 0 ? stream.headers : void 0;
    const options = {
      ...stream.type === "hls" && { depth: stream.proxyDepth ?? 0 }
    };
    const payload = {
      headers: headers2,
      options
    };
    if (stream.type === "hls") {
      payload.type = "hls";
      payload.url = stream.playlist;
      stream.playlist = `${DEFAULT_PROXY_URL}?${new URLSearchParams({ payload: Buffer.from(JSON.stringify(payload)).toString("base64url") })}`;
    }
    if (stream.type === "file") {
      payload.type = "mp4";
      Object.entries(stream.qualities).forEach((entry) => {
        payload.url = entry[1].url;
        entry[1].url = `${DEFAULT_PROXY_URL}?${new URLSearchParams({ payload: Buffer.from(JSON.stringify(payload)).toString("base64url") })}`;
      });
    }
    stream.headers = {};
    stream.flags = [flags.CORS_ALLOWED];
    return stream;
  }
  function createM3U8ProxyUrl(url, features, headers2 = {}) {
    if (features && !features.requires.includes(flags.CORS_ALLOWED)) {
      return url;
    }
    const encodedUrl = encodeURIComponent(url);
    const encodedHeaders = encodeURIComponent(JSON.stringify(headers2));
    return `${CONFIGURED_M3U8_PROXY_URL}/m3u8-proxy?url=${encodedUrl}${headers2 ? `&headers=${encodedHeaders}` : ""}`;
  }
  function updateM3U8ProxyUrl(url) {
    if (url.includes("/m3u8-proxy?url=")) {
      return url.replace(/https:\/\/[^/]+\/m3u8-proxy/, `${CONFIGURED_M3U8_PROXY_URL}/m3u8-proxy`);
    }
    return url;
  }
  function makeSourcerer(state) {
    const mediaTypes = [];
    if (state.scrapeMovie) mediaTypes.push("movie");
    if (state.scrapeShow) mediaTypes.push("show");
    return {
      ...state,
      type: "source",
      disabled: state.disabled ?? false,
      externalSource: state.externalSource ?? false,
      mediaTypes
    };
  }
  function makeEmbed(state) {
    return {
      ...state,
      type: "embed",
      disabled: state.disabled ?? false,
      mediaTypes: void 0
    };
  }
  async function comboScraper$e(ctx) {
    const embedPage = await ctx.proxiedFetcher(
      `https://bombthe.irish/embed/${ctx.media.type === "movie" ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`
    );
    const $ = cheerio.load(embedPage);
    const embeds = [];
    $("#dropdownMenu a").each((_, element) => {
      const url = new URL($(element).data("url")).searchParams.get("url");
      if (!url) return;
      embeds.push({ embedId: $(element).text().toLowerCase(), url: atob(url) });
    });
    return { embeds };
  }
  const bombtheirishScraper = makeSourcerer({
    id: "bombtheirish",
    name: "bombthe.irish",
    rank: 100,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$e,
    scrapeShow: comboScraper$e
  });
  const providers$1 = [
    {
      id: "streamtape",
      name: "Streamtape",
      rank: 160
    },
    {
      id: "streamtape-latino",
      name: "Streamtape (Latino)",
      rank: 159
    }
  ];
  function embed$1(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      // No longer IP locked
      async scrape(ctx) {
        var _a;
        const embedHtml = await ctx.proxiedFetcher(ctx.url);
        const match = embedHtml.match(/robotlink'\).innerHTML = (.*)'/);
        if (!match) throw new Error("No match found");
        const [fh, sh] = ((_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.split("+ ('")) ?? [];
        if (!fh || !sh) throw new Error("No match found");
        const url = `https:${fh == null ? void 0 : fh.replace(/'/g, "").trim()}${sh == null ? void 0 : sh.substring(3).trim()}`;
        return {
          stream: [
            {
              id: "primary",
              type: "file",
              flags: [flags.CORS_ALLOWED],
              // No longer IP locked
              captions: [],
              qualities: {
                unknown: {
                  type: "mp4",
                  url
                }
              },
              preferredHeaders: {
                Referer: "https://streamtape.com"
              }
            }
          ]
        };
      }
    });
  }
  const [streamtapeScraper, streamtapeLatinoScraper] = providers$1.map(embed$1);
  const warezcdnPlayerBase = "https://warezcdn.com/player";
  function decrypt(input) {
    let output = atob(input);
    output = output.trim();
    output = output.split("").reverse().join("");
    let last = output.slice(-5);
    last = last.split("").reverse().join("");
    output = output.slice(0, -5);
    return `${output}${last}`;
  }
  async function getDecryptedId(ctx) {
    var _a;
    const page = await ctx.proxiedFetcher(`/player.php?${new URLSearchParams({ id: ctx.url })}`, {
      baseUrl: warezcdnPlayerBase,
      headers: {
        Referer: `${warezcdnPlayerBase}/getEmbed.php?${new URLSearchParams({
          id: ctx.url,
          sv: "warezcdn"
        })}`
      }
    });
    const allowanceKey = (_a = page.match(/let allowanceKey = "(.*?)";/)) == null ? void 0 : _a[1];
    if (!allowanceKey) throw new NotFoundError("Failed to get allowanceKey");
    const streamData = await ctx.proxiedFetcher("/functions.php", {
      baseUrl: warezcdnPlayerBase,
      method: "POST",
      body: new URLSearchParams({
        getVideo: ctx.url,
        key: allowanceKey
      })
    });
    const stream = JSON.parse(streamData);
    if (!stream.id) throw new NotFoundError("can't get stream id");
    const decryptedId = decrypt(stream.id);
    if (!decryptedId) throw new NotFoundError("can't get file id");
    return decryptedId;
  }
  const cdnListing = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64];
  async function checkUrls(ctx, fileId) {
    for (const id of cdnListing) {
      const url = `https://cloclo${id}.cloud.mail.ru/weblink/view/${fileId}`;
      const response = await ctx.proxiedFetcher.full(url, {
        method: "GET",
        headers: {
          Range: "bytes=0-1"
        }
      });
      if (response.statusCode === 206) return url;
    }
    return null;
  }
  const warezcdnembedMp4Scraper = makeEmbed({
    id: "warezcdnembedmp4",
    name: "WarezCDN MP4",
    rank: 83,
    disabled: false,
    flags: [],
    async scrape(ctx) {
      const decryptedId = await getDecryptedId(ctx);
      if (!decryptedId) throw new NotFoundError("can't get file id");
      const streamUrl = await checkUrls(ctx, decryptedId);
      if (!streamUrl) throw new NotFoundError("can't get stream id");
      return {
        stream: [
          {
            id: "primary",
            captions: [],
            qualities: {
              unknown: {
                type: "mp4",
                url: streamUrl
              }
            },
            type: "file",
            flags: [],
            headers: {
              Origin: "https://cloud.mail.ru",
              Referer: "https://cloud.mail.ru/"
            }
          }
        ]
      };
    }
  });
  const SKIP_VALIDATION_CHECK_IDS = [
    warezcdnembedMp4Scraper.id,
    streamtapeScraper.id
    // deltaScraper.id,
    // alphaScraper.id,
    // novaScraper.id,
    // astraScraper.id,
    // orionScraper.id,
  ];
  const UNPROXIED_VALIDATION_CHECK_IDS = [
    // sources here are always proxied, so we dont need to validate with a proxy
    bombtheirishScraper.id
    // this one is dead, but i'll keep it here for now
  ];
  function isValidStream(stream) {
    if (!stream) return false;
    if (stream.type === "hls") {
      if (!stream.playlist) return false;
      return true;
    }
    if (stream.type === "file") {
      const validQualities = Object.values(stream.qualities).filter((v) => v.url.length > 0);
      if (validQualities.length === 0) return false;
      return true;
    }
    return false;
  }
  function isAlreadyProxyUrl(url) {
    return url.includes("/m3u8-proxy?url=") || url.includes("shegu.net");
  }
  function isErrorResponse(result) {
    if (result.statusCode === 403) return true;
    const bodyStr = typeof result.body === "string" ? result.body : String(result.body);
    if (result.statusCode === 200 && bodyStr.trim() === "error_wrong_ip") return true;
    if (result.statusCode === 200) {
      try {
        const parsed = JSON.parse(bodyStr);
        if (parsed.status === 403 && parsed.msg === "Access Denied") return true;
      } catch {
      }
    }
    return false;
  }
  async function validatePlayableStream(stream, ops, sourcererId) {
    if (SKIP_VALIDATION_CHECK_IDS.includes(sourcererId)) return stream;
    if (stream.skipValidation) return stream;
    const alwaysUseNormalFetch = UNPROXIED_VALIDATION_CHECK_IDS.includes(sourcererId);
    if (stream.type === "hls") {
      if (stream.playlist.startsWith("data:")) return stream;
      const useNormalFetch = alwaysUseNormalFetch || isAlreadyProxyUrl(stream.playlist);
      let result;
      if (useNormalFetch) {
        try {
          const response = await fetch(stream.playlist, {
            method: "GET",
            headers: {
              ...stream.preferredHeaders,
              ...stream.headers
            },
            signal: AbortSignal.timeout(2e4)
          });
          result = {
            statusCode: response.status,
            body: await response.text(),
            finalUrl: response.url
          };
        } catch (error) {
          return null;
        }
      } else {
        try {
          result = await Promise.race([
            ops.proxiedFetcher.full(stream.playlist, {
              method: "GET",
              headers: {
                ...stream.preferredHeaders,
                ...stream.headers
              }
            }),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("Timeout")), 2e4);
            })
          ]);
        } catch {
          return null;
        }
      }
      if (result.statusCode < 200 || result.statusCode >= 400 || isErrorResponse(result)) return null;
      return stream;
    }
    if (stream.type === "file") {
      const validQualitiesResults = await Promise.all(
        Object.values(stream.qualities).map(async (quality) => {
          const useNormalFetch = alwaysUseNormalFetch || isAlreadyProxyUrl(quality.url);
          if (useNormalFetch) {
            try {
              const response = await fetch(quality.url, {
                method: "GET",
                headers: {
                  ...stream.preferredHeaders,
                  ...stream.headers,
                  Range: "bytes=0-1"
                },
                signal: AbortSignal.timeout(2e4)
              });
              return {
                statusCode: response.status,
                body: await response.text(),
                finalUrl: response.url
              };
            } catch (error) {
              return { statusCode: 500, body: "", finalUrl: quality.url };
            }
          }
          try {
            return await Promise.race([
              ops.proxiedFetcher.full(quality.url, {
                method: "GET",
                headers: {
                  ...stream.preferredHeaders,
                  ...stream.headers,
                  Range: "bytes=0-1"
                }
              }),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Timeout")), 2e4);
              })
            ]);
          } catch {
            return { statusCode: 500, body: "", finalUrl: quality.url };
          }
        })
      );
      const validQualities = stream.qualities;
      Object.keys(stream.qualities).forEach((quality, index) => {
        if (validQualitiesResults[index].statusCode < 200 || validQualitiesResults[index].statusCode >= 400 || isErrorResponse(validQualitiesResults[index])) {
          delete validQualities[quality];
        }
      });
      if (Object.keys(validQualities).length === 0) return null;
      return { ...stream, qualities: validQualities };
    }
    return null;
  }
  async function validatePlayableStreams(streams, ops, sourcererId) {
    if (SKIP_VALIDATION_CHECK_IDS.includes(sourcererId)) return streams;
    return (await Promise.all(streams.map((stream) => validatePlayableStream(stream, ops, sourcererId)))).filter(
      (v) => v !== null
    );
  }
  async function scrapeInvidualSource(list, ops) {
    const sourceScraper = list.sources.find((v) => ops.id === v.id);
    if (!sourceScraper) throw new Error("Source with ID not found");
    if (ops.media.type === "movie" && !sourceScraper.scrapeMovie) throw new Error("Source is not compatible with movies");
    if (ops.media.type === "show" && !sourceScraper.scrapeShow) throw new Error("Source is not compatible with shows");
    const contextBase = {
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      features: ops.features,
      progress(val) {
        var _a, _b;
        (_b = (_a = ops.events) == null ? void 0 : _a.update) == null ? void 0 : _b.call(_a, {
          id: sourceScraper.id,
          percentage: val,
          status: "pending"
        });
      }
    };
    let output = null;
    if (ops.media.type === "movie" && sourceScraper.scrapeMovie)
      output = await sourceScraper.scrapeMovie({
        ...contextBase,
        media: ops.media
      });
    else if (ops.media.type === "show" && sourceScraper.scrapeShow)
      output = await sourceScraper.scrapeShow({
        ...contextBase,
        media: ops.media
      });
    if (output == null ? void 0 : output.stream) {
      output.stream = output.stream.filter((stream) => isValidStream(stream)).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
      output.stream = output.stream.map(
        (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
      );
    }
    if (!output) throw new Error("output is null");
    output.embeds = output.embeds.filter((embed2) => {
      const e = list.embeds.find((v) => v.id === embed2.embedId);
      if (!e || e.disabled) return false;
      return true;
    });
    if ((!output.stream || output.stream.length === 0) && output.embeds.length === 0)
      throw new NotFoundError("No streams found");
    if (output.stream && output.stream.length > 0 && output.embeds.length === 0) {
      const playableStreams = await validatePlayableStreams(output.stream, ops, sourceScraper.id);
      if (playableStreams.length === 0) throw new NotFoundError("No playable streams found");
      output.stream = playableStreams;
    }
    return output;
  }
  async function scrapeIndividualEmbed(list, ops) {
    const embedScraper = list.embeds.find((v) => ops.id === v.id);
    if (!embedScraper) throw new Error("Embed with ID not found");
    const url = ops.url;
    const output = await embedScraper.scrape({
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      features: ops.features,
      url,
      progress(val) {
        var _a, _b;
        (_b = (_a = ops.events) == null ? void 0 : _a.update) == null ? void 0 : _b.call(_a, {
          id: embedScraper.id,
          percentage: val,
          status: "pending"
        });
      }
    });
    output.stream = output.stream.filter((stream) => isValidStream(stream)).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
    if (output.stream.length === 0) throw new NotFoundError("No streams found");
    output.stream = output.stream.map(
      (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
    );
    const playableStreams = await validatePlayableStreams(output.stream, ops, embedScraper.id);
    if (playableStreams.length === 0) throw new NotFoundError("No playable streams found");
    output.stream = playableStreams;
    return output;
  }
  function reorderOnIdList(order, list) {
    const copy = [...list];
    copy.sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      if (bIndex >= 0) return 1;
      if (aIndex >= 0) return -1;
      return b.rank - a.rank;
    });
    return copy;
  }
  async function runAllProviders(list, ops) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    const sources = reorderOnIdList(ops.sourceOrder ?? [], list.sources).filter((source) => {
      if (ops.media.type === "movie") return !!source.scrapeMovie;
      if (ops.media.type === "show") return !!source.scrapeShow;
      return false;
    });
    const embeds = reorderOnIdList(ops.embedOrder ?? [], list.embeds);
    const embedIds = embeds.map((embed2) => embed2.id);
    let lastId = "";
    const contextBase = {
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      features: ops.features,
      progress(val) {
        var _a2, _b2;
        (_b2 = (_a2 = ops.events) == null ? void 0 : _a2.update) == null ? void 0 : _b2.call(_a2, {
          id: lastId,
          percentage: val,
          status: "pending"
        });
      }
    };
    (_b = (_a = ops.events) == null ? void 0 : _a.init) == null ? void 0 : _b.call(_a, {
      sourceIds: sources.map((v) => v.id)
    });
    for (const source of sources) {
      (_d = (_c = ops.events) == null ? void 0 : _c.start) == null ? void 0 : _d.call(_c, source.id);
      lastId = source.id;
      let output = null;
      try {
        if (ops.media.type === "movie" && source.scrapeMovie)
          output = await source.scrapeMovie({
            ...contextBase,
            media: ops.media
          });
        else if (ops.media.type === "show" && source.scrapeShow)
          output = await source.scrapeShow({
            ...contextBase,
            media: ops.media
          });
        if (output) {
          output.stream = (output.stream ?? []).filter(isValidStream).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
          output.stream = output.stream.map(
            (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
          );
        }
        if (!output || !((_e = output.stream) == null ? void 0 : _e.length) && !output.embeds.length) {
          throw new NotFoundError("No streams found");
        }
      } catch (error) {
        const updateParams = {
          id: source.id,
          percentage: 100,
          status: error instanceof NotFoundError ? "notfound" : "failure",
          reason: error instanceof NotFoundError ? error.message : void 0,
          error: error instanceof NotFoundError ? void 0 : error
        };
        (_g = (_f = ops.events) == null ? void 0 : _f.update) == null ? void 0 : _g.call(_f, updateParams);
        continue;
      }
      if (!output) throw new Error("Invalid media type");
      if ((_h = output.stream) == null ? void 0 : _h[0]) {
        try {
          const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
          if (!playableStream) throw new NotFoundError("No streams found");
          return {
            sourceId: source.id,
            stream: playableStream
          };
        } catch (error) {
          const updateParams = {
            id: source.id,
            percentage: 100,
            status: error instanceof NotFoundError ? "notfound" : "failure",
            reason: error instanceof NotFoundError ? error.message : "Stream validation failed",
            error: error instanceof NotFoundError ? void 0 : error
          };
          (_j = (_i = ops.events) == null ? void 0 : _i.update) == null ? void 0 : _j.call(_i, updateParams);
        }
      }
      const sortedEmbeds = output.embeds.filter((embed2) => {
        const e = list.embeds.find((v) => v.id === embed2.embedId);
        return e && !e.disabled;
      }).sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));
      if (sortedEmbeds.length > 0) {
        (_l = (_k = ops.events) == null ? void 0 : _k.discoverEmbeds) == null ? void 0 : _l.call(_k, {
          embeds: sortedEmbeds.map((embed2, i) => ({
            id: [source.id, i].join("-"),
            embedScraperId: embed2.embedId
          })),
          sourceId: source.id
        });
      }
      for (const [ind, embed2] of sortedEmbeds.entries()) {
        const scraper = embeds.find((v) => v.id === embed2.embedId);
        if (!scraper) throw new Error("Invalid embed returned");
        const id = [source.id, ind].join("-");
        (_n = (_m = ops.events) == null ? void 0 : _m.start) == null ? void 0 : _n.call(_m, id);
        lastId = id;
        let embedOutput;
        try {
          embedOutput = await scraper.scrape({
            ...contextBase,
            url: embed2.url
          });
          embedOutput.stream = embedOutput.stream.filter(isValidStream).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
          embedOutput.stream = embedOutput.stream.map(
            (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
          );
          if (embedOutput.stream.length === 0) {
            throw new NotFoundError("No streams found");
          }
          const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed2.embedId);
          if (!playableStream) throw new NotFoundError("No streams found");
          embedOutput.stream = [playableStream];
        } catch (error) {
          const updateParams = {
            id,
            percentage: 100,
            status: error instanceof NotFoundError ? "notfound" : "failure",
            reason: error instanceof NotFoundError ? error.message : void 0,
            error: error instanceof NotFoundError ? void 0 : error
          };
          (_p = (_o = ops.events) == null ? void 0 : _o.update) == null ? void 0 : _p.call(_o, updateParams);
          continue;
        }
        return {
          sourceId: source.id,
          embedId: scraper.id,
          stream: embedOutput.stream[0]
        };
      }
    }
    return null;
  }
  function makeControls(ops) {
    const list = {
      embeds: ops.embeds,
      sources: ops.sources
    };
    const providerRunnerOps = {
      features: ops.features,
      fetcher: makeFetcher(ops.fetcher),
      proxiedFetcher: makeFetcher(ops.proxiedFetcher ?? ops.fetcher),
      proxyStreams: ops.proxyStreams
    };
    return {
      runAll(runnerOps) {
        return runAllProviders(list, {
          ...providerRunnerOps,
          ...runnerOps
        });
      },
      runSourceScraper(runnerOps) {
        return scrapeInvidualSource(list, {
          ...providerRunnerOps,
          ...runnerOps
        });
      },
      runEmbedScraper(runnerOps) {
        return scrapeIndividualEmbed(list, {
          ...providerRunnerOps,
          ...runnerOps
        });
      },
      getMetadata(id) {
        return getSpecificId(list, id);
      },
      listSources() {
        return getAllSourceMetaSorted(list);
      },
      listEmbeds() {
        return getAllEmbedMetaSorted(list);
      }
    };
  }
  const userAgent$1 = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36";
  const filemoonScraper = makeEmbed({
    id: "filemoon",
    name: "Filemoon",
    rank: 405,
    flags: [],
    async scrape(ctx) {
      const headers2 = {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        Referer: `${new URL(ctx.url).origin}/`,
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "sec-ch-ua": '"Not A(Brand";v="8", "Chromium";v="132"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": userAgent$1
      };
      const response = await ctx.proxiedFetcher(ctx.url, { headers: headers2 });
      const soup = cheerio.load(response);
      const iframe = soup("iframe").first();
      if (!iframe.length) throw new NotFoundError("No iframe found");
      const iframeUrl = iframe.attr("src");
      if (!iframeUrl) throw new NotFoundError("No iframe src found");
      const iframeResponse = await ctx.proxiedFetcher(iframeUrl, { headers: headers2 });
      const iframeSoup = cheerio.load(iframeResponse);
      const jsCode = iframeSoup("script").filter((_, el) => {
        const text = iframeSoup(el).html() || "";
        return text.includes("eval(function(p,a,c,k,e,d)");
      }).first().html();
      if (!jsCode) throw new NotFoundError("No packed JS code found");
      const unpacked = unpacker.unpack(jsCode);
      if (!unpacked) throw new NotFoundError("Failed to unpack JS code");
      const videoMatch = unpacked.match(/file:"([^"]+)"/);
      if (!videoMatch) throw new NotFoundError("No video URL found");
      const videoUrl = videoMatch[1];
      return {
        stream: [
          {
            id: "primary",
            type: "hls",
            playlist: videoUrl,
            headers: {
              Referer: `${new URL(ctx.url).origin}/`,
              "User-Agent": userAgent$1
            },
            flags: [],
            captions: []
          }
        ]
      };
    }
  });
  const mixdropBase = "https://mixdrop.ag";
  const packedRegex = /(eval\(function\(p,a,c,k,e,d\){.*{}\)\))/;
  const linkRegex = /MDCore\.wurl="(.*?)";/;
  const mixdropScraper = makeEmbed({
    id: "mixdrop",
    name: "MixDrop",
    rank: 198,
    flags: [flags.IP_LOCKED],
    async scrape(ctx) {
      let embedUrl = ctx.url;
      if (ctx.url.includes("primewire")) embedUrl = (await ctx.fetcher.full(ctx.url)).finalUrl;
      const embedId = new URL(embedUrl).pathname.split("/")[2];
      const streamRes = await ctx.proxiedFetcher(`/e/${embedId}`, {
        baseUrl: mixdropBase
      });
      const packed = streamRes.match(packedRegex);
      if (!packed) {
        throw new Error("failed to find packed mixdrop JavaScript");
      }
      const unpacked = unpacker__namespace.unpack(packed[1]);
      const link = unpacked.match(linkRegex);
      if (!link) {
        throw new Error("failed to find packed mixdrop source link");
      }
      const url = link[1];
      return {
        stream: [
          {
            id: "primary",
            type: "file",
            flags: [flags.IP_LOCKED],
            captions: [],
            qualities: {
              unknown: {
                type: "mp4",
                url: url.startsWith("http") ? url : `https:${url}`,
                // URLs don't always start with the protocol
                headers: {
                  // MixDrop requires this header on all streams
                  Referer: mixdropBase
                }
              }
            }
          }
        ]
      };
    }
  });
  const serverMirrorEmbed = makeEmbed({
    id: "mirror",
    name: "Mirror",
    rank: 1,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      const context = JSON.parse(ctx.url);
      if (context.type === "hls") {
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: context.stream,
              headers: context.headers,
              flags: context.flags,
              captions: context.captions,
              skipValidation: context.skipvalid
            }
          ]
        };
      }
      return {
        stream: [
          {
            id: "primary",
            type: "file",
            qualities: context.qualities,
            flags: context.flags,
            captions: context.captions,
            headers: context.headers,
            skipValidation: context.skipvalid
          }
        ]
      };
    }
  });
  const VIDNEST_SERVERS = ["hollymoviehd", "allmovies"];
  const baseUrl$8 = "https://second.vidnest.fun";
  const PASSPHRASE = "A7kP9mQeXU2BWcD4fRZV+Sg8yN0/M5tLbC1HJQwYe6pOKFaE3vTnPZsRuYdVmLq2";
  const serverConfigs = {
    hollymoviehd: {
      streamDomains: ["pkaystream.cc", "flashstream.cc"],
      origin: "https://flashstream.cc",
      referer: "https://flashstream.cc/"
    },
    allmovies: {
      streamDomains: null,
      origin: "",
      referer: ""
    }
  };
  function base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  async function decryptVidnestData(encryptedBase64) {
    const encryptedBytes = base64ToUint8Array(encryptedBase64);
    const iv2 = encryptedBytes.slice(0, 12);
    const ciphertext = encryptedBytes.slice(12, -16);
    const tag = encryptedBytes.slice(-16);
    const keyData = base64ToUint8Array(PASSPHRASE).slice(0, 32);
    const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv2 }, cryptoKey, combined);
    return JSON.parse(new TextDecoder("utf-8").decode(decrypted));
  }
  function makeVidnestEmbed(id, rank = 100) {
    const config = serverConfigs[id];
    return makeEmbed({
      id: `vidnest-${id}`,
      name: `Vidnest ${id}`,
      rank,
      disabled: false,
      flags: [],
      async scrape(ctx) {
        const query = JSON.parse(ctx.url);
        const { type, tmdbId, season, episode } = query;
        const endpoint = type === "movie" ? `/${id}/movie/${tmdbId}` : `/${id}/tv/${tmdbId}/${season}/${episode}`;
        const res = await ctx.proxiedFetcher(endpoint, {
          baseUrl: baseUrl$8,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (!(res == null ? void 0 : res.data)) throw new NotFoundError("No data");
        const decrypted = await decryptVidnestData(res.data);
        const sources = decrypted.sources || decrypted.streams || [];
        const streams = [];
        for (const source of sources) {
          const url = source.file || source.url;
          if (!url) continue;
          if ((config == null ? void 0 : config.streamDomains) && !config.streamDomains.some((d) => url.includes(d))) continue;
          streams.push(url);
        }
        if (!streams.length) throw new NotFoundError("No streams");
        ctx.progress(100);
        return {
          stream: [
            {
              id,
              type: "hls",
              playlist: streams[0],
              headers: {
                Origin: config == null ? void 0 : config.origin,
                Referer: config == null ? void 0 : config.referer
              },
              flags: [],
              captions: []
            }
          ]
        };
      }
    });
  }
  const VidnestEmbeds = VIDNEST_SERVERS.map((server, i) => makeVidnestEmbed(server, 104 - i));
  const providers = [
    {
      id: "server-13",
      rank: 112
    },
    {
      id: "server-18",
      rank: 111,
      flags: []
    },
    {
      id: "server-11",
      rank: 102
    },
    {
      id: "server-7",
      rank: 92
    },
    {
      id: "server-10",
      rank: 82
    },
    {
      id: "server-1",
      rank: 72
    },
    {
      id: "server-16",
      rank: 64
    },
    {
      id: "server-3",
      rank: 62
    },
    {
      id: "server-17",
      rank: 52
    },
    {
      id: "server-2",
      rank: 42
    },
    {
      id: "server-4",
      rank: 32
    },
    {
      id: "server-5",
      rank: 24
    },
    {
      id: "server-14",
      // catflix? uwu.m3u8
      rank: 22
    },
    {
      id: "server-6",
      rank: 21
    },
    {
      id: "server-15",
      rank: 20
    },
    {
      id: "server-8",
      rank: 19
    },
    {
      id: "server-9",
      rank: 18
    },
    {
      id: "server-19",
      rank: 17
    },
    {
      id: "server-12",
      rank: 16
    }
    // { // Looks like this was removed
    //   id: 'server-20',
    //   rank: 1,
    //   name: 'Cineby',
    // },
  ];
  function embed(provider) {
    return makeEmbed({
      id: provider.id,
      name: provider.name || provider.id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
      // disabled: provider.disabled,
      disabled: true,
      rank: provider.rank,
      flags: [flags.CORS_ALLOWED],
      async scrape(ctx) {
        return {
          stream: [
            {
              id: "primary",
              type: "hls",
              playlist: ctx.url,
              flags: [flags.CORS_ALLOWED],
              captions: []
            }
          ]
        };
      }
    });
  }
  const [
    VidsrcsuServer1Scraper,
    VidsrcsuServer2Scraper,
    VidsrcsuServer3Scraper,
    VidsrcsuServer4Scraper,
    VidsrcsuServer5Scraper,
    VidsrcsuServer6Scraper,
    VidsrcsuServer7Scraper,
    VidsrcsuServer8Scraper,
    VidsrcsuServer9Scraper,
    VidsrcsuServer10Scraper,
    VidsrcsuServer11Scraper,
    VidsrcsuServer12Scraper,
    VidsrcsuServer20Scraper
  ] = providers.map(embed);
  const viperScraper = makeEmbed({
    id: "viper",
    name: "Viper",
    rank: 182,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx) {
      const apiResponse = await ctx.proxiedFetcher.full(ctx.url, {
        headers: {
          Accept: "application/json",
          Referer: "https://embed.su/"
        }
      });
      if (!apiResponse.body.source) {
        throw new NotFoundError("No source found");
      }
      const playlistUrl = apiResponse.body.source.replace(/^.*\/viper\//, "https://");
      const headers2 = {
        referer: "https://megacloud.store/",
        origin: "https://megacloud.store"
      };
      return {
        stream: [
          {
            type: "hls",
            id: "primary",
            playlist: createM3U8ProxyUrl(playlistUrl, ctx.features, headers2),
            headers: headers2,
            flags: [flags.CORS_ALLOWED],
            captions: []
          }
        ]
      };
    }
  });
  const baseUrl$7 = "https://www3.animeflv.net";
  async function searchAnimeFlv(ctx, title) {
    const searchUrl = `${baseUrl$7}/browse?q=${encodeURIComponent(title)}`;
    const html = await ctx.proxiedFetcher(searchUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const $ = cheerio.load(html);
    const results = $("div.Container ul.ListAnimes li article");
    if (!results.length) throw new NotFoundError("No se encontró el anime en AnimeFLV");
    let animeUrl = "";
    results.each((_, el) => {
      const resultTitle = $(el).find("a h3").text().trim().toLowerCase();
      if (resultTitle === title.trim().toLowerCase()) {
        animeUrl = $(el).find("div.Description a.Button").attr("href") || "";
        return false;
      }
    });
    if (!animeUrl) {
      animeUrl = results.first().find("div.Description a.Button").attr("href") || "";
    }
    if (!animeUrl) throw new NotFoundError("No se encontró el anime en AnimeFLV");
    const fullUrl = animeUrl.startsWith("http") ? animeUrl : `${baseUrl$7}${animeUrl}`;
    return fullUrl;
  }
  async function getEpisodes(ctx, animeUrl) {
    const html = await ctx.proxiedFetcher(animeUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const $ = cheerio.load(html);
    let episodes = [];
    $("script").each((_, script) => {
      var _a, _b, _c;
      const data = $(script).html() || "";
      if (data.includes("var anime_info =")) {
        const animeInfo = (_a = data.split("var anime_info = [")[1]) == null ? void 0 : _a.split("];")[0];
        const animeUri = (_b = animeInfo == null ? void 0 : animeInfo.split(",")[2]) == null ? void 0 : _b.replace(/"/g, "").trim();
        const episodesRaw = (_c = data.split("var episodes = [")[1]) == null ? void 0 : _c.split("];")[0];
        if (animeUri && episodesRaw) {
          const arrEpisodes = episodesRaw.split("],[");
          episodes = arrEpisodes.map((arrEp) => {
            const noEpisode = arrEp.replace("[", "").replace("]", "").split(",")[0];
            return {
              number: parseInt(noEpisode, 10),
              url: `${baseUrl$7}/ver/${animeUri}-${noEpisode}`
            };
          });
        } else {
          console.log("[AnimeFLV] No se encontró animeUri o lista de episodios en el script");
        }
      }
    });
    if (episodes.length === 0) {
      console.log("[AnimeFLV] No se encontraron episodios");
    }
    return episodes;
  }
  async function getEmbeds(ctx, episodeUrl) {
    const html = await ctx.proxiedFetcher(episodeUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const $ = cheerio.load(html);
    const script = $('script:contains("var videos =")').html();
    if (!script) return {};
    const match = script.match(/var videos = (\{[\s\S]*?\});/);
    if (!match) return {};
    let videos = {};
    try {
      videos = JSON.parse(match[1]);
    } catch {
      return {};
    }
    let streamwishJapanese;
    if (videos.SUB) {
      const sw = videos.SUB.find((s) => {
        var _a;
        return ((_a = s.title) == null ? void 0 : _a.toLowerCase()) === "sw";
      });
      if (sw && (sw.url || sw.code)) {
        streamwishJapanese = sw.url || sw.code;
        if (streamwishJapanese && streamwishJapanese.startsWith("/e/")) {
          streamwishJapanese = `https://streamwish.to${streamwishJapanese}`;
        }
      }
    }
    let streamtapeLatino;
    if (videos.LAT) {
      const stape = videos.LAT.find(
        (s) => {
          var _a, _b;
          return ((_a = s.title) == null ? void 0 : _a.toLowerCase()) === "stape" || ((_b = s.title) == null ? void 0 : _b.toLowerCase()) === "streamtape";
        }
      );
      if (stape && (stape.url || stape.code)) {
        streamtapeLatino = stape.url || stape.code;
        if (streamtapeLatino && streamtapeLatino.startsWith("/e/")) {
          streamtapeLatino = `https://streamtape.com${streamtapeLatino}`;
        }
      }
    }
    return {
      "streamwish-japanese": streamwishJapanese,
      "streamtape-latino": streamtapeLatino
    };
  }
  async function comboScraper$d(ctx) {
    var _a;
    const title = ctx.media.title;
    if (!title) throw new NotFoundError("Falta el título");
    console.log(`[AnimeFLV] Iniciando scraping para: ${title}`);
    const animeUrl = await searchAnimeFlv(ctx, title);
    let episodeUrl = animeUrl;
    if (ctx.media.type === "show") {
      const episode = (_a = ctx.media.episode) == null ? void 0 : _a.number;
      if (!episode) throw new NotFoundError("Faltan datos de episodio");
      const episodes = await getEpisodes(ctx, animeUrl);
      const ep = episodes.find((e) => e.number === episode);
      if (!ep) throw new NotFoundError(`No se encontró el episodio ${episode}`);
      episodeUrl = ep.url;
    } else if (ctx.media.type === "movie") {
      const html = await ctx.proxiedFetcher(animeUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      const $ = cheerio.load(html);
      let animeUri = null;
      $("script").each((_, script) => {
        var _a2, _b;
        const data = $(script).html() || "";
        if (data.includes("var anime_info =")) {
          const animeInfo = (_a2 = data.split("var anime_info = [")[1]) == null ? void 0 : _a2.split("];")[0];
          animeUri = ((_b = animeInfo == null ? void 0 : animeInfo.split(",")[2]) == null ? void 0 : _b.replace(/"/g, "").trim()) || null;
        }
      });
      if (!animeUri) throw new NotFoundError("No se pudo obtener el animeUri para la película");
      episodeUrl = `${baseUrl$7}/ver/${animeUri}-1`;
    }
    const embedsObj = await getEmbeds(ctx, episodeUrl);
    const filteredEmbeds = Object.entries(embedsObj).filter(([, url]) => typeof url === "string" && !!url).map(([embedId, url]) => ({ embedId, url }));
    if (filteredEmbeds.length === 0) {
      throw new NotFoundError("No se encontraron streams válidos");
    }
    return { embeds: filteredEmbeds };
  }
  const animeflvScraper = makeSourcerer({
    id: "animeflv",
    name: "AnimeFLV",
    rank: 90,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeShow: comboScraper$d,
    scrapeMovie: comboScraper$d
  });
  const baseUrl$6 = "https://cinehdplus.gratis";
  async function comboScraper$c(ctx) {
    const searchUrl = `${baseUrl$6}/series/?story=${ctx.media.tmdbId}&do=search&subaction=search`;
    const searchPage = await ctx.proxiedFetcher(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: baseUrl$6
      }
    });
    const $search = cheerio.load(searchPage);
    const seriesUrl = $search(".card__title a[href]:first").attr("href");
    if (!seriesUrl) {
      throw new NotFoundError("Series not found in search results");
    }
    ctx.progress(30);
    const seriesPageUrl = new URL(seriesUrl, baseUrl$6);
    const seriesPage = await ctx.proxiedFetcher(seriesPageUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: baseUrl$6
      }
    });
    const $ = cheerio.load(seriesPage);
    const episodeSelector = `[data-num="${ctx.media.season.number}x${ctx.media.episode.number}"]`;
    const mirrorUrls = $(episodeSelector).siblings(".mirrors").children("[data-link]").map((_, el) => $(el).attr("data-link")).get().filter(Boolean).filter((link) => !link.match(/cinehdplus/)).map((link) => {
      const url = link.startsWith("http") ? link : `https://${link}`;
      try {
        return new URL(url);
      } catch {
        return null;
      }
    }).filter((url) => url !== null && url.hostname !== "cinehdplus.gratis");
    if (!mirrorUrls.length) {
      throw new NotFoundError("No streaming links found for this episode");
    }
    ctx.progress(70);
    const embeds = mirrorUrls.map((url) => {
      let embedId;
      if (url.hostname.includes("supervideo")) {
        embedId = "supervideo";
      } else if (url.hostname.includes("dropload")) {
        embedId = "dropload";
      } else {
        return null;
      }
      return {
        embedId,
        url: url.href
      };
    }).filter((embed2) => embed2 !== null);
    ctx.progress(90);
    return {
      embeds
    };
  }
  const cinehdplusScraper = makeSourcerer({
    id: "cinehdplus",
    name: "CineHDPlus (Latino)",
    rank: 4,
    disabled: false,
    flags: [],
    scrapeShow: comboScraper$c
  });
  const TMDB_API_KEY = "a500049f3e06109fe3e8289b06cf5685";
  async function fetchTMDBName(ctx, lang = "en-US") {
    const type = ctx.media.type === "movie" ? "movie" : "tv";
    const url = `https://api.themoviedb.org/3/${type}/${ctx.media.tmdbId}?api_key=${TMDB_API_KEY}&language=${lang}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching TMDB data: ${response.statusText}`);
    }
    const data = await response.json();
    return ctx.media.type === "movie" ? data.title : data.name;
  }
  const baseUrl$5 = "https://www.cuevana3.eu";
  function normalizeTitle$2(title) {
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  }
  async function getStreamUrl(ctx, embedUrl) {
    try {
      const html = await ctx.proxiedFetcher(embedUrl);
      const match = html.match(/var url = '([^']+)'/);
      if (match) {
        return match[1];
      }
    } catch {
    }
    return null;
  }
  function validateStream(url) {
    return url.startsWith("https://") && (url.includes("streamwish") || url.includes("filemoon") || url.includes("vidhide"));
  }
  async function extractVideos(ctx, videos) {
    const videoList = [];
    for (const [lang, videoArray] of Object.entries(videos)) {
      if (!videoArray) continue;
      for (const video of videoArray) {
        if (!video.result) continue;
        const realUrl = await getStreamUrl(ctx, video.result);
        if (!realUrl || !validateStream(realUrl)) continue;
        let embedId = "";
        if (realUrl.includes("filemoon")) embedId = "filemoon";
        else if (realUrl.includes("streamwish")) {
          if (lang === "latino") embedId = "streamwish-latino";
          else if (lang === "spanish") embedId = "streamwish-spanish";
          else if (lang === "english") embedId = "streamwish-english";
          else embedId = "streamwish-latino";
        } else if (realUrl.includes("vidhide")) embedId = "vidhide";
        else if (realUrl.includes("voe")) embedId = "voe";
        else continue;
        videoList.push({
          embedId,
          url: realUrl
        });
      }
    }
    return videoList;
  }
  async function comboScraper$b(ctx) {
    var _a, _b, _c, _d;
    const mediaType = ctx.media.type;
    const tmdbId = ctx.media.tmdbId;
    if (!tmdbId) {
      throw new NotFoundError("TMDB ID is required to fetch the title in Spanish");
    }
    const translatedTitle = await fetchTMDBName(ctx, "es-ES");
    let normalizedTitle = normalizeTitle$2(translatedTitle);
    let pageUrl = mediaType === "movie" ? `${baseUrl$5}/ver-pelicula/${normalizedTitle}` : `${baseUrl$5}/episodio/${normalizedTitle}-temporada-${(_a = ctx.media.season) == null ? void 0 : _a.number}-episodio-${(_b = ctx.media.episode) == null ? void 0 : _b.number}`;
    ctx.progress(60);
    let pageContent = await ctx.proxiedFetcher(pageUrl);
    let $ = cheerio.load(pageContent);
    let script = $("script").toArray().find((scriptEl) => {
      var _a2;
      const content = ((_a2 = scriptEl.children[0]) == null ? void 0 : _a2.data) || "";
      return content.includes('{"props":{"pageProps":');
    });
    let embeds = [];
    if (script) {
      let jsonData;
      try {
        const jsonString = script.children[0].data;
        const start = jsonString.indexOf('{"props":{"pageProps":');
        if (start === -1) throw new Error("No valid JSON start found");
        const partialJson = jsonString.slice(start);
        jsonData = JSON.parse(partialJson);
      } catch (error) {
        throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
      }
      if (mediaType === "movie") {
        const movieData = jsonData.props.pageProps.thisMovie;
        if (movieData == null ? void 0 : movieData.videos) {
          embeds = await extractVideos(ctx, movieData.videos) ?? [];
        }
      } else {
        const episodeData = jsonData.props.pageProps.episode;
        if (episodeData == null ? void 0 : episodeData.videos) {
          embeds = await extractVideos(ctx, episodeData.videos) ?? [];
        }
      }
    }
    if (embeds.length === 0) {
      normalizedTitle = normalizeTitle$2(ctx.media.title);
      pageUrl = mediaType === "movie" ? `${baseUrl$5}/ver-pelicula/${normalizedTitle}` : `${baseUrl$5}/episodio/${normalizedTitle}-temporada-${(_c = ctx.media.season) == null ? void 0 : _c.number}-episodio-${(_d = ctx.media.episode) == null ? void 0 : _d.number}`;
      pageContent = await ctx.proxiedFetcher(pageUrl);
      $ = cheerio.load(pageContent);
      script = $("script").toArray().find((scriptEl) => {
        var _a2;
        const content = ((_a2 = scriptEl.children[0]) == null ? void 0 : _a2.data) || "";
        return content.includes('{"props":{"pageProps":');
      });
      if (script) {
        let jsonData;
        try {
          const jsonString = script.children[0].data;
          const start = jsonString.indexOf('{"props":{"pageProps":');
          if (start === -1) throw new Error("No valid JSON start found");
          const partialJson = jsonString.slice(start);
          jsonData = JSON.parse(partialJson);
        } catch (error) {
          throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
        }
        if (mediaType === "movie") {
          const movieData = jsonData.props.pageProps.thisMovie;
          if (movieData == null ? void 0 : movieData.videos) {
            embeds = await extractVideos(ctx, movieData.videos) ?? [];
          }
        } else {
          const episodeData = jsonData.props.pageProps.episode;
          if (episodeData == null ? void 0 : episodeData.videos) {
            embeds = await extractVideos(ctx, episodeData.videos) ?? [];
          }
        }
      }
    }
    if (embeds.length === 0) {
      throw new NotFoundError("No valid streams found");
    }
    return { embeds };
  }
  const cuevana3Scraper = makeSourcerer({
    id: "cuevana3",
    name: "Cuevana3",
    rank: 80,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$b,
    scrapeShow: comboScraper$b
  });
  const EMBED_API_BASE = "https://embed.nowfar.lol/api";
  async function comboScraper$a(ctx) {
    const { tmdbId } = ctx.media;
    ctx.progress(10);
    const apiUrl = ctx.media.type === "movie" ? `${EMBED_API_BASE}/streams/movie/${tmdbId}` : `${EMBED_API_BASE}/streams/tv/${tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
    const data = await ctx.fetcher(apiUrl);
    ctx.progress(60);
    if (!(data == null ? void 0 : data.streams) || data.streams.length === 0) throw new NotFoundError("No streams from embed API");
    ctx.progress(90);
    return {
      embeds: [],
      stream: data.streams.map((s) => ({
        id: s.name || "primary",
        type: "hls",
        playlist: s.url,
        captions: [],
        flags: ["cors-allowed"],
        headers: s.headers || {}
      }))
    };
  }
  const embedApiScraper = makeSourcerer({
    id: "embedapi",
    name: "nowfar.lol api🔥",
    rank: 900,
    disabled: false,
    flags: ["cors-allowed"],
    scrapeMovie: comboScraper$a,
    scrapeShow: comboScraper$a
  });
  function loadTurnstileScript() {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
        const checkLoaded = () => {
          if (window.turnstile) {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Turnstile script"));
      document.head.appendChild(script);
    });
  }
  async function getTurnstileToken(sitekey, timeout = 3e4) {
    if (typeof window === "undefined") {
      throw new Error("Turnstile verification requires browser environment");
    }
    try {
      await loadTurnstileScript();
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "-9999px";
      container.style.width = "1px";
      container.style.height = "1px";
      container.style.overflow = "hidden";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);
      return new Promise((resolve, reject) => {
        let widgetId;
        let timeoutId;
        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (widgetId && window.turnstile) {
            try {
              window.turnstile.remove(widgetId);
            } catch (e) {
            }
          }
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
        };
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error("Turnstile verification timed out"));
        }, timeout);
        try {
          widgetId = window.turnstile.render(container, {
            sitekey,
            callback: (token) => {
              cleanup();
              resolve(token);
            },
            "error-callback": (error) => {
              cleanup();
              reject(new Error(`Turnstile error: ${error}`));
            },
            "expired-callback": () => {
              cleanup();
              reject(new Error("Turnstile token expired"));
            },
            "timeout-callback": () => {
              cleanup();
              reject(new Error("Turnstile verification timed out"));
            }
          });
        } catch (error) {
          cleanup();
          reject(new Error(`Failed to render Turnstile widget: ${error}`));
        }
      });
    } catch (error) {
      throw new Error(`Turnstile verification failed: ${error}`);
    }
  }
  function labelToLanguageCode(label) {
    const languageMap = {
      "chinese - hong kong": "zh",
      "chinese - traditional": "zh",
      czech: "cs",
      danish: "da",
      dutch: "nl",
      english: "en",
      "english - sdh": "en",
      finnish: "fi",
      french: "fr",
      german: "de",
      greek: "el",
      hungarian: "hu",
      italian: "it",
      korean: "ko",
      norwegian: "no",
      polish: "pl",
      portuguese: "pt",
      "portuguese - brazilian": "pt",
      romanian: "ro",
      "spanish - european": "es",
      "spanish - latin american": "es",
      spanish: "es",
      swedish: "sv",
      turkish: "tr",
      اَلْعَرَبِيَّةُ: "ar",
      বাংলা: "bn",
      filipino: "tl",
      indonesia: "id",
      اردو: "ur",
      English: "en",
      Arabic: "ar",
      Bosnian: "bs",
      Bulgarian: "bg",
      Croatian: "hr",
      Czech: "cs",
      Danish: "da",
      Dutch: "nl",
      Estonian: "et",
      Finnish: "fi",
      French: "fr",
      German: "de",
      Greek: "el",
      Hebrew: "he",
      Hungarian: "hu",
      Indonesian: "id",
      Italian: "it",
      Norwegian: "no",
      Persian: "fa",
      "farsi/persian": "fa",
      Polish: "pl",
      Portuguese: "pt",
      "Protuguese (BR)": "pt-br",
      Romanian: "ro",
      Russian: "ru",
      russian: "ru",
      Serbian: "sr",
      Slovenian: "sl",
      Spanish: "es",
      Swedish: "sv",
      Thai: "th",
      Turkish: "tr",
      // Simple language codes
      ng: "en",
      re: "fr",
      pa: "es"
    };
    const mappedCode = languageMap[label.toLowerCase()];
    if (mappedCode) return mappedCode;
    const code = ISO6391.getCode(label);
    if (code.length === 0) return null;
    return code;
  }
  const getUserToken = () => {
    var _a;
    try {
      if (typeof window === "undefined") return null;
      const prefData = window.localStorage.getItem("__MW::preferences");
      if (!prefData) return null;
      const parsedAuth = JSON.parse(prefData);
      return ((_a = parsedAuth == null ? void 0 : parsedAuth.state) == null ? void 0 : _a.febboxKey) || null;
    } catch (e) {
      console.warn("Unable to access localStorage or parse auth data:", e);
      return null;
    }
  };
  const BASE_URL = "https://mznxiwqjdiq00239q.space";
  async function comboScraper$9(ctx) {
    var _a;
    const userToken = getUserToken();
    if (!userToken) throw new NotFoundError("Requires a user token!");
    let turnstileToken;
    try {
      turnstileToken = await getTurnstileToken("0x4AAAAAABgPwhrOT6x6sTjI");
    } catch (error) {
      alert("FED API Turnstile verification failed. Please refresh the page and try again.");
      throw new NotFoundError(`Turnstile verification failed: ${error}`);
    }
    ctx.progress(50);
    const name = ctx.media.title;
    let apiUrl = `${BASE_URL}/fedapi?name=${encodeURIComponent(name)}&year=${ctx.media.releaseYear}&ui=${encodeURIComponent(userToken)}`;
    if (ctx.media.type === "show") {
      apiUrl += `&season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
    }
    const res = await fetch(apiUrl, { credentials: "omit" });
    if (!res.ok) throw new NotFoundError("API request failed");
    const data = await res.json();
    if ((data == null ? void 0 : data.error) && data.error.endsWith("not found in database")) {
      throw new NotFoundError("No stream found");
    }
    if (!data) throw new NotFoundError("No response from API");
    ctx.progress(90);
    const streams = Object.entries(data.streams).reduce((acc, [quality, entry]) => {
      const url = typeof entry === "string" ? entry : entry.url;
      const type = typeof entry === "string" ? "mp4" : entry.type;
      let qualityKey;
      if (quality === "ORG") {
        const urlPath = url.split("?")[0];
        if (urlPath.toLowerCase().includes(".mp4") || type === "hls") {
          acc.unknown = { url, type };
        }
        return acc;
      }
      if (quality === "4K") {
        qualityKey = 2160;
      } else {
        qualityKey = parseInt(quality.replace("P", ""), 10);
      }
      if (Number.isNaN(qualityKey) || acc[qualityKey]) return acc;
      acc[qualityKey] = { url, type };
      return acc;
    }, {});
    const captions = [];
    if (data.subtitles) {
      for (const [langKey, subtitleData] of Object.entries(data.subtitles)) {
        const languageKeyPart = langKey.split("_")[0];
        const languageName = languageKeyPart.charAt(0).toUpperCase() + languageKeyPart.slice(1);
        const languageCode = ((_a = labelToLanguageCode(languageName)) == null ? void 0 : _a.toLowerCase()) ?? "unknown";
        if (subtitleData.subtitle_link) {
          const url = subtitleData.subtitle_link;
          const isVtt = url.toLowerCase().endsWith(".vtt");
          captions.push({
            type: isVtt ? "vtt" : "srt",
            id: url,
            url,
            language: languageCode,
            hasCorsRestrictions: false
          });
        }
      }
    }
    ctx.progress(90);
    const hlsStream = streams[2160] ?? streams[1080] ?? streams[720] ?? streams[480] ?? streams[360] ?? streams.unknown;
    if ((hlsStream == null ? void 0 : hlsStream.type) === "hls") {
      return {
        embeds: [],
        stream: [
          {
            id: "primary",
            captions,
            playlist: hlsStream.url,
            type: "hls",
            flags: [flags.CORS_ALLOWED]
          }
        ]
      };
    }
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          captions,
          qualities: {
            ...streams[2160] && { "4k": { type: "mp4", url: streams[2160].url } },
            ...streams[1080] && { 1080: { type: "mp4", url: streams[1080].url } },
            ...streams[720] && { 720: { type: "mp4", url: streams[720].url } },
            ...streams[480] && { 480: { type: "mp4", url: streams[480].url } },
            ...streams[360] && { 360: { type: "mp4", url: streams[360].url } },
            ...streams.unknown && { unknown: { type: "mp4", url: streams.unknown.url } }
          },
          type: "file",
          flags: [flags.CORS_ALLOWED]
        }
      ]
    };
  }
  const FedAPIScraper = makeSourcerer({
    id: "fedapi",
    name: "FED API (4K) 🔥",
    rank: 300,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$9,
    scrapeShow: comboScraper$9
  });
  function normalizeTitle$1(title) {
    let titleTrimmed = title.trim().toLowerCase();
    if (titleTrimmed !== "the movie" && titleTrimmed.endsWith("the movie")) {
      titleTrimmed = titleTrimmed.replace("the movie", "");
    }
    if (titleTrimmed !== "the series" && titleTrimmed.endsWith("the series")) {
      titleTrimmed = titleTrimmed.replace("the series", "");
    }
    return titleTrimmed.replace(/['":]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
  }
  function compareTitle(a, b) {
    return normalizeTitle$1(a) === normalizeTitle$1(b);
  }
  function compareMedia(media, title, releaseYear) {
    const isSameYear = releaseYear === void 0 ? true : media.releaseYear === releaseYear;
    return compareTitle(media.title, title) && isSameYear;
  }
  function getValidQualityFromString(quality) {
    switch (quality.toLowerCase().replace("p", "")) {
      case "360":
        return "360";
      case "480":
        return "480";
      case "720":
        return "720";
      case "1080":
        return "1080";
      case "2160":
        return "4k";
      case "4k":
        return "4k";
      default:
        return "unknown";
    }
  }
  const baseUrl$4 = "https://fsharetv.co";
  async function comboScraper$8(ctx) {
    var _a, _b;
    const searchPage = await ctx.proxiedFetcher("/search", {
      baseUrl: baseUrl$4,
      query: {
        q: ctx.media.title
      }
    });
    const search$ = cheerio.load(searchPage);
    const searchResults = [];
    search$(".movie-item").each((_, element) => {
      var _a2;
      const [, title, year] = ((_a2 = search$(element).find("b").text()) == null ? void 0 : _a2.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/)) || [];
      const url = search$(element).find("a").attr("href");
      if (!title || !url) return;
      searchResults.push({ title, year: Number(year) ?? void 0, url });
    });
    const watchPageUrl = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
    if (!watchPageUrl) throw new NotFoundError("No watchable item found");
    ctx.progress(50);
    const watchPage = await ctx.proxiedFetcher(watchPageUrl.replace("/movie", "/w"), { baseUrl: baseUrl$4 });
    const fileId = (_b = watchPage.match(/Movie\.setSource\('([^']*)'/)) == null ? void 0 : _b[1];
    if (!fileId) throw new Error("File ID not found");
    const apiRes = await ctx.proxiedFetcher(
      `/api/file/${fileId}/source`,
      {
        baseUrl: baseUrl$4,
        query: {
          type: "watch"
        }
      }
    );
    if (!apiRes.data.file.sources.length) throw new Error("No sources found");
    const mediaBase = new URL((await ctx.proxiedFetcher.full(apiRes.data.file.sources[0].src, { baseUrl: baseUrl$4 })).finalUrl).origin;
    const qualities = apiRes.data.file.sources.reduce(
      (acc, source) => {
        const quality = typeof source.quality === "number" ? source.quality.toString() : source.quality;
        const validQuality = getValidQualityFromString(quality);
        acc[validQuality] = {
          type: "mp4",
          url: `${mediaBase}${source.src.replace("/api", "")}`
        };
        return acc;
      },
      {}
    );
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          flags: [],
          headers: {
            referer: "https://fsharetv.co"
          },
          qualities,
          captions: []
        }
      ]
    };
  }
  const fsharetvScraper = makeSourcerer({
    id: "fsharetv",
    name: "FshareTV",
    rank: 201,
    flags: [],
    scrapeMovie: comboScraper$8
  });
  const ORIGIN_HOST = "https://www3.fsonline.app";
  const MOVIE_PAGE_URL = "https://www3.fsonline.app/film/";
  const SHOW_PAGE_URL = "https://www3.fsonline.app/episoade/{{MOVIE}}-sezonul-{{SEASON}}-episodul-{{EPISODE}}/";
  const EMBED_URL = "https://www3.fsonline.app/wp-admin/admin-ajax.php";
  function throwOnResponse(response) {
    if (response.statusCode >= 400) {
      throw new Error(`Response does not indicate success: ${response.statusCode}`);
    }
  }
  function getMoviePageURL(name, season, episode) {
    const n = name.trim().normalize("NFD").toLowerCase().replace(/[^a-zA-Z0-9. ]+/g, "").replace(".", " ").split(" ").join("-");
    if (season && episode) {
      return SHOW_PAGE_URL.replace("{{MOVIE}}", n).replace("{{SEASON}}", `${season}`).replace("{{EPISODE}}", `${episode}`);
    }
    return `${MOVIE_PAGE_URL}${n}/`;
  }
  async function fetchIFrame(ctx, url) {
    const response = await ctx.proxiedFetcher.full(url, {
      headers: {
        Referer: ORIGIN_HOST,
        Origin: ORIGIN_HOST,
        "sec-fetch-dest": "iframe",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site"
      }
    });
    throwOnResponse(response);
    return response;
  }
  const LOG_PREFIX$1 = `[Doodstream]`;
  const STREAM_REQ_PATERN = /\$\.get\('(\/pass_md5\/.+?)'/;
  const TOKEN_PARAMS_PATERN = /\+ "\?(token=.+?)"/;
  function generateStreamKey() {
    const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let o = 0; o < 10; o++) {
      result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return result;
  }
  function extractStreamInfo($) {
    let streamReq;
    let tokenParams;
    $("script").each((_, script) => {
      var _a, _b;
      if (streamReq && tokenParams) {
        return;
      }
      const text = $(script).text().trim();
      if (!streamReq) {
        streamReq = (_a = text.match(STREAM_REQ_PATERN)) == null ? void 0 : _a[1];
      }
      if (!tokenParams) {
        tokenParams = (_b = text.match(TOKEN_PARAMS_PATERN)) == null ? void 0 : _b[1];
      }
    });
    tokenParams = `${generateStreamKey()}?${tokenParams}${Date.now()}`;
    return [streamReq, tokenParams];
  }
  async function getStream(ctx, url) {
    let $;
    let streamHost;
    let reqReferer;
    try {
      const response = await fetchIFrame(ctx, url);
      if (!response) {
        return void 0;
      }
      $ = cheerio__namespace.load(response.body);
      streamHost = new URL(response.finalUrl).hostname;
      reqReferer = response.finalUrl;
    } catch (error) {
      console.error(LOG_PREFIX$1, "Failed to fetch iframe", error);
      return void 0;
    }
    const [streamReq, tokenParams] = extractStreamInfo($);
    if (!streamReq || !tokenParams) {
      console.error(LOG_PREFIX$1, "Couldn't find stream info", streamReq, tokenParams);
      return void 0;
    }
    let streamURL;
    try {
      const response = await ctx.proxiedFetcher.full(`https://${streamHost}${streamReq}`, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: reqReferer,
          Origin: ORIGIN_HOST
        }
      });
      throwOnResponse(response);
      streamURL = await response.body + tokenParams;
    } catch (error) {
      console.error(LOG_PREFIX$1, "Failed to request stream URL", error);
      return void 0;
    }
    return [streamURL, new URL(streamURL).hostname];
  }
  async function scrapeDoodstreamEmbed(ctx) {
    let streamURL;
    let streamHost;
    try {
      const stream = await getStream(ctx, ctx.url);
      if (!stream || !stream[0]) {
        return {
          stream: []
        };
      }
      [streamURL, streamHost] = stream;
    } catch (error) {
      console.warn(LOG_PREFIX$1, "Failed to get stream", error);
      throw error;
    }
    return {
      stream: [
        {
          type: "file",
          id: "primary",
          flags: [flags.CORS_ALLOWED],
          captions: [],
          qualities: {
            unknown: {
              type: "mp4",
              url: streamURL
            }
          },
          headers: {
            Referer: `https://${streamHost}/`,
            Origin: ORIGIN_HOST
          }
        }
      ]
    };
  }
  const LOG_PREFIX = "[FSOnline]";
  async function getMovieID(ctx, url) {
    let $;
    try {
      const response = await ctx.proxiedFetcher.full(url, {
        headers: {
          Origin: ORIGIN_HOST,
          Referer: ORIGIN_HOST
        }
      });
      throwOnResponse(response);
      $ = cheerio__namespace.load(await response.body);
    } catch (error) {
      console.error(LOG_PREFIX, "Failed to fetch movie page", url, error);
      return void 0;
    }
    const movieID = $("#show_player_lazy").attr("movie-id");
    if (!movieID) {
      console.error(LOG_PREFIX, "Could not find movie ID", url);
      return void 0;
    }
    return movieID;
  }
  async function getMovieSources(ctx, id, refererHeader) {
    const sources = /* @__PURE__ */ new Map();
    let $;
    try {
      const response = await ctx.proxiedFetcher.full(EMBED_URL, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: refererHeader,
          Origin: ORIGIN_HOST
        },
        body: `action=lazy_player&movieID=${id}`
      });
      throwOnResponse(response);
      $ = cheerio__namespace.load(await response.body);
    } catch (error) {
      console.error(LOG_PREFIX, "Could not fetch source index", error);
      return sources;
    }
    $("li.dooplay_player_option").each((_, element) => {
      const name = $(element).find("span").text().trim();
      const url = $(element).attr("data-vs");
      if (!url) {
        console.warn(LOG_PREFIX, "Skipping invalid source", name);
        return;
      }
      sources.set(name, url);
    });
    return sources;
  }
  function addEmbedFromSources(name, sources, embeds) {
    const url = sources.get(name);
    if (!url) {
      return;
    }
    embeds.push({
      embedId: `fsonline-${name.toLowerCase()}`,
      url
    });
  }
  async function comboScraper$7(ctx) {
    const movieName = await fetchTMDBName(ctx);
    const moviePageURL = getMoviePageURL(
      ctx.media.type === "movie" ? `${movieName} ${ctx.media.releaseYear}` : movieName,
      ctx.media.type === "show" ? ctx.media.season.number : void 0,
      ctx.media.type === "show" ? ctx.media.episode.number : void 0
    );
    const movieID = await getMovieID(ctx, moviePageURL);
    if (!movieID) {
      return {
        embeds: [],
        stream: []
      };
    }
    const embeds = [];
    const sources = await getMovieSources(ctx, movieID, moviePageURL);
    addEmbedFromSources("Filemoon", sources, embeds);
    addEmbedFromSources("Doodstream", sources, embeds);
    if (embeds.length < 1) {
      throw new Error("No valid sources were found");
    }
    return {
      embeds
    };
  }
  const fsOnlineScraper = makeSourcerer({
    id: "fsonline",
    name: "FSOnline",
    rank: 140,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$7,
    scrapeShow: comboScraper$7
  });
  const fsOnlineEmbeds = [
    makeEmbed({
      id: "fsonline-doodstream",
      name: "Doodstream",
      rank: 140,
      scrape: scrapeDoodstreamEmbed,
      flags: [flags.CORS_ALLOWED]
    })
    // makeEmbed({
    //   id: 'fsonline-filemoon',
    //   name: 'Filemoon',
    //   rank: 140,
    //   scrape: scrapeFilemoonEmbed,
    //   flags: [flags.CORS_ALLOWED],
    // }),
  ];
  const baseUrl$3 = "https://ww3.pelisplus.to";
  function normalizeTitle(title) {
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  }
  function decodeBase64(str) {
    try {
      return atob(str);
    } catch {
      return "";
    }
  }
  function fetchUrls(text) {
    if (!text) return [];
    const linkRegex2 = /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])/g;
    return Array.from(text.matchAll(linkRegex2)).map((m) => m[0].replace(/^"+|"+$/g, ""));
  }
  async function resolvePlayerUrl(ctx, url) {
    try {
      const html = await ctx.proxiedFetcher(url);
      const $ = cheerio.load(html);
      const script = $('script:contains("window.onload")').html() || "";
      return fetchUrls(script)[0] || "";
    } catch {
      return "";
    }
  }
  async function extractVidhideEmbed(ctx, $) {
    const regIsUrl = /^https?:\/\/([\w.-]+\.[a-z]{2,})(\/.*)?$/i;
    const playerLinks = [];
    $(".bg-tabs ul li").each((idx, el) => {
      var _a, _b;
      const li = $(el);
      const langBtn = (_b = (_a = li.parent()) == null ? void 0 : _a.parent()) == null ? void 0 : _b.find("button").first().text().trim().toLowerCase();
      const dataServer = li.attr("data-server") || "";
      const decoded = decodeBase64(dataServer);
      const url = regIsUrl.test(decoded) ? decoded : `${baseUrl$3}/player/${btoa(dataServer)}`;
      playerLinks.push({ idx, langBtn, url });
    });
    const results = [];
    for (const link of playerLinks) {
      let realUrl = link.url;
      if (realUrl.includes("/player/")) {
        realUrl = await resolvePlayerUrl(ctx, realUrl);
      }
      if (/vidhide/i.test(realUrl)) {
        let embedId = "vidhide";
        if (link.langBtn.includes("latino")) embedId = "vidhide-latino";
        else if (link.langBtn.includes("castellano") || link.langBtn.includes("español")) embedId = "vidhide-spanish";
        else if (link.langBtn.includes("ingles") || link.langBtn.includes("english")) embedId = "vidhide-english";
        results.push({ embedId, url: realUrl });
      }
    }
    return results;
  }
  async function fetchTmdbTitleInSpanish(tmdbId, apiKey, mediaType) {
    const endpoint = mediaType === "movie" ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=es-ES` : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=es-ES`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Error fetching TMDB data: ${response.statusText}`);
    }
    const tmdbData = await response.json();
    return mediaType === "movie" ? tmdbData.title : tmdbData.name;
  }
  async function fallbackSearchByGithub(ctx) {
    var _a, _b;
    const tmdbId = ctx.media.tmdbId;
    const mediaType = ctx.media.type;
    if (!tmdbId) return [];
    const jsonFile = mediaType === "movie" ? "pelisplushd_movies.json" : "pelisplushd_series.json";
    let fallbacks = {};
    try {
      const url = `https://raw.githubusercontent.com/moonpic/fixed-titles/main/${jsonFile}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      fallbacks = await response.json();
    } catch {
      return [];
    }
    const fallbackTitle = fallbacks[tmdbId.toString()];
    if (!fallbackTitle) return [];
    const normalizedTitle = normalizeTitle(fallbackTitle);
    const pageUrl = mediaType === "movie" ? `${baseUrl$3}/pelicula/${normalizedTitle}` : `${baseUrl$3}/serie/${normalizedTitle}/season/${(_a = ctx.media.season) == null ? void 0 : _a.number}/episode/${(_b = ctx.media.episode) == null ? void 0 : _b.number}`;
    let html = "";
    try {
      html = await ctx.proxiedFetcher(pageUrl);
    } catch {
      return [];
    }
    const $ = cheerio.load(html);
    return extractVidhideEmbed(ctx, $);
  }
  async function comboScraper$6(ctx) {
    var _a, _b;
    const mediaType = ctx.media.type;
    const tmdbId = ctx.media.tmdbId;
    const apiKey = "7604525319adb2db8e7e841cb98e9217";
    if (!tmdbId) throw new NotFoundError("TMDB ID is required to fetch the title in Spanish");
    let translatedTitle = "";
    try {
      translatedTitle = await fetchTmdbTitleInSpanish(Number(tmdbId), apiKey, mediaType);
    } catch {
      throw new NotFoundError("Could not get the title from TMDB");
    }
    const normalizedTitle = normalizeTitle(translatedTitle);
    const pageUrl = mediaType === "movie" ? `${baseUrl$3}/pelicula/${normalizedTitle}` : `${baseUrl$3}/serie/${normalizedTitle}/season/${(_a = ctx.media.season) == null ? void 0 : _a.number}/episode/${(_b = ctx.media.episode) == null ? void 0 : _b.number}`;
    ctx.progress(60);
    let html = "";
    try {
      html = await ctx.proxiedFetcher(pageUrl);
    } catch {
      html = "";
    }
    let embeds = [];
    if (html) {
      const $ = cheerio.load(html);
      try {
        embeds = await extractVidhideEmbed(ctx, $);
      } catch {
        embeds = [];
      }
    }
    if (!embeds.length) {
      embeds = await fallbackSearchByGithub(ctx);
    }
    if (!embeds.length) {
      throw new NotFoundError("No vidhide embed found in PelisPlusHD");
    }
    return { embeds };
  }
  const pelisplushdScraper = makeSourcerer({
    id: "pelisplushd",
    name: "PelisPlusHD",
    rank: 75,
    flags: [flags.IP_LOCKED],
    // Vidhide embeds are IP locked
    scrapeMovie: comboScraper$6,
    scrapeShow: comboScraper$6
  });
  const baseUrl$2 = "api.rgshows.ru";
  const headers$3 = {
    referer: "https://rgshows.ru/",
    origin: "https://rgshows.ru",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  async function comboScraper$5(ctx) {
    var _a;
    let url = `https://${baseUrl$2}/main`;
    if (ctx.media.type === "movie") {
      url += `/movie/${ctx.media.tmdbId}`;
    } else if (ctx.media.type === "show") {
      url += `/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    }
    const res = await ctx.proxiedFetcher(url, { headers: headers$3 });
    if (!((_a = res == null ? void 0 : res.stream) == null ? void 0 : _a.url)) {
      throw new NotFoundError("No streams found");
    }
    if (res.stream.url === "https://vidzee.wtf/playlist/69/master.m3u8") {
      throw new NotFoundError("Found only vidzee porn stream");
    }
    const streamUrl = res.stream.url;
    const streamHost = new URL(streamUrl).host;
    const m3u8Headers = {
      ...headers$3,
      host: streamHost,
      origin: "https://www.rgshows.ru",
      referer: "https://www.rgshows.ru/"
    };
    ctx.progress(100);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "hls",
          playlist: streamUrl,
          headers: m3u8Headers,
          flags: [],
          captions: []
        }
      ]
    };
  }
  const rgshowsScraper = makeSourcerer({
    id: "rgshows",
    name: "RGShows",
    rank: 176,
    flags: [],
    scrapeMovie: comboScraper$5,
    scrapeShow: comboScraper$5
  });
  const streamboxBase = "https://vidjoy.pro/embed/api/fastfetch";
  async function comboScraper$4(ctx) {
    var _a, _b;
    const apiRes = await ctx.proxiedFetcher(
      ctx.media.type === "movie" ? `${streamboxBase}/${ctx.media.tmdbId}?sr=0` : `${streamboxBase}/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}?sr=0`
    );
    if (!apiRes) {
      throw new NotFoundError("Failed to fetch StreamBox data");
    }
    console.log(apiRes);
    const data = await apiRes;
    const streams = {};
    data.url.forEach((stream) => {
      streams[stream.resulation] = stream.link;
    });
    const captions = data.tracks.map((track) => ({
      id: track.lang,
      url: track.url,
      language: track.code,
      type: "srt"
    }));
    if (data.provider === "MovieBox") {
      return {
        embeds: [],
        stream: [
          {
            id: "primary",
            captions,
            qualities: {
              ...streams["1080"] && {
                1080: {
                  type: "mp4",
                  url: streams["1080"]
                }
              },
              ...streams["720"] && {
                720: {
                  type: "mp4",
                  url: streams["720"]
                }
              },
              ...streams["480"] && {
                480: {
                  type: "mp4",
                  url: streams["480"]
                }
              },
              ...streams["360"] && {
                360: {
                  type: "mp4",
                  url: streams["360"]
                }
              }
            },
            type: "file",
            flags: [flags.CORS_ALLOWED],
            preferredHeaders: {
              Referer: (_a = data.headers) == null ? void 0 : _a.Referer
            }
          }
        ]
      };
    }
    const hlsStream = data.url.find((stream) => stream.type === "hls") || data.url[0];
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          captions,
          playlist: hlsStream.link,
          type: "hls",
          flags: [flags.CORS_ALLOWED],
          preferredHeaders: {
            Referer: (_b = data.headers) == null ? void 0 : _b.Referer
          }
        }
      ]
    };
  }
  const streamboxScraper = makeSourcerer({
    id: "streambox",
    name: "StreamBox",
    rank: 119,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$4,
    scrapeShow: comboScraper$4
  });
  const API_BASE$1 = "https://enc-dec.app/api";
  const VIDLINK_BASE$1 = "https://vidlink.pro/api/b";
  const headers$2 = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    Connection: "keep-alive",
    Referer: "https://vidlink.pro/",
    Origin: "https://vidlink.pro"
  };
  async function encryptTmdbId$1(ctx, tmdbId) {
    const response = await ctx.proxiedFetcher(`${API_BASE$1}/enc-vidlink`, {
      method: "GET",
      query: { text: tmdbId }
    });
    if (!(response == null ? void 0 : response.result)) {
      throw new NotFoundError("Failed to encrypt TMDB ID");
    }
    return response.result;
  }
  async function comboScraper$3(ctx) {
    const { tmdbId } = ctx.media;
    ctx.progress(10);
    const encryptedId = await encryptTmdbId$1(ctx, tmdbId.toString());
    ctx.progress(30);
    const apiUrl = ctx.media.type === "movie" ? `${VIDLINK_BASE$1}/movie/${encryptedId}` : `${VIDLINK_BASE$1}/tv/${encryptedId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    const vidlinkRaw = await ctx.proxiedFetcher(apiUrl, {
      headers: headers$2
    });
    if (!vidlinkRaw) {
      throw new NotFoundError("No response from vidlink API");
    }
    ctx.progress(60);
    let vidlinkData;
    try {
      vidlinkData = typeof vidlinkRaw === "string" ? JSON.parse(vidlinkRaw) : vidlinkRaw;
    } catch {
      throw new NotFoundError("Invalid JSON from vidlink API");
    }
    ctx.progress(80);
    if (!vidlinkData.stream) {
      throw new NotFoundError("No stream data found in vidlink response");
    }
    const { stream } = vidlinkData;
    const captions = [];
    if (stream.captions && Array.isArray(stream.captions)) {
      for (const caption of stream.captions) {
        const captionType = caption.type === "srt" ? "srt" : "vtt";
        captions.push({
          id: caption.id || caption.url,
          url: caption.url,
          language: caption.language || "Unknown",
          type: captionType,
          hasCorsRestrictions: caption.hasCorsRestrictions || false
        });
      }
    }
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: stream.id || "primary",
          type: stream.type || "file",
          qualities: stream.qualities || {},
          playlist: stream.playlist,
          captions,
          flags: [],
          headers: stream.headers || headers$2
        }
      ]
    };
  }
  const vidlinkScraper = makeSourcerer({
    id: "vidlink",
    name: "VidLink 🔥",
    rank: 310,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper$3,
    scrapeShow: comboScraper$3
  });
  const API_BASE = "https://enc-dec.app/api";
  const VIDLINK_BASE = "https://vidlink.pro/api/b";
  const headers$1 = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    Connection: "keep-alive",
    Referer: "https://vidlink.pro/",
    Origin: "https://vidlink.pro"
  };
  async function encryptTmdbId(ctx, tmdbId) {
    const response = await ctx.proxiedFetcher(`${API_BASE}/enc-vidlink`, {
      method: "GET",
      query: { text: tmdbId }
    });
    if (!(response == null ? void 0 : response.result)) {
      throw new NotFoundError("Failed to encrypt TMDB ID");
    }
    return response.result;
  }
  async function comboScraper$2(ctx) {
    const { tmdbId } = ctx.media;
    ctx.progress(10);
    const encryptedId = await encryptTmdbId(ctx, tmdbId.toString());
    ctx.progress(30);
    const apiUrl = ctx.media.type === "movie" ? `${VIDLINK_BASE}/movie/${encryptedId}` : `${VIDLINK_BASE}/tv/${encryptedId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    const vidlinkRaw = await ctx.proxiedFetcher(apiUrl, {
      headers: headers$1
    });
    if (!vidlinkRaw) {
      throw new NotFoundError("No response from vidlink API");
    }
    ctx.progress(60);
    let vidlinkData;
    try {
      vidlinkData = typeof vidlinkRaw === "string" ? JSON.parse(vidlinkRaw) : vidlinkRaw;
    } catch {
      throw new NotFoundError("Invalid JSON from vidlink API");
    }
    ctx.progress(80);
    if (!vidlinkData.stream) {
      throw new NotFoundError("No stream data found in vidlink response");
    }
    const { stream } = vidlinkData;
    const captions = [];
    if (stream.captions && Array.isArray(stream.captions)) {
      for (const caption of stream.captions) {
        const captionType = caption.type === "srt" ? "srt" : "vtt";
        captions.push({
          id: caption.id || caption.url,
          url: caption.url,
          language: caption.language || "Unknown",
          type: captionType,
          hasCorsRestrictions: caption.hasCorsRestrictions || false
        });
      }
    }
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: stream.id || "primary",
          type: stream.type || "file",
          qualities: stream.qualities || {},
          playlist: stream.playlist,
          captions,
          flags: [],
          headers: stream.headers || headers$1
        }
      ]
    };
  }
  const vidlinkScraper2 = makeSourcerer({
    id: "vidlink2",
    name: "VidLink Alt 🔥",
    rank: 308,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper$2,
    scrapeShow: comboScraper$2
  });
  const headers = {
    Origin: "https://vidrock.net",
    Referer: "https://vidrock.net/"
  };
  const passphrase = "x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9";
  const key = CryptoJS.enc.Utf8.parse(passphrase);
  const iv = CryptoJS.enc.Utf8.parse(passphrase.substring(0, 16));
  const baseUrl$1 = "https://vidrock.net/api";
  const userAgent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";
  async function comboScraper$1(ctx) {
    const itemType = ctx.media.type;
    let itemId;
    if (itemType === "movie") {
      itemId = ctx.media.tmdbId;
    } else {
      itemId = `${ctx.media.tmdbId}_${ctx.media.season.number}_${ctx.media.episode.number}`;
    }
    const encrypted = CryptoJS.AES.encrypt(itemId, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    let encryptedBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    encryptedBase64 = encryptedBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const encoded = encodeURIComponent(encryptedBase64);
    const url = `${baseUrl$1}/${itemType}/${encoded}`;
    const res = await ctx.proxiedFetcher(url, {
      headers: {
        ...headers,
        "User-Agent": userAgent
      }
    });
    let parsedRes = res;
    if (typeof res === "string") {
      try {
        parsedRes = JSON.parse(res);
      } catch (e) {
        throw new NotFoundError("No sources found from Vidrock API: Invalid JSON response");
      }
    }
    if (!parsedRes || typeof parsedRes !== "object" || Array.isArray(parsedRes)) {
      throw new NotFoundError("No sources found from Vidrock API: Invalid response");
    }
    const embeds = [];
    const createMirrorEmbed = (serverName, serverData) => {
      if (!(serverData == null ? void 0 : serverData.url)) return null;
      if (serverName.includes("Astra") || serverData.url.includes(".workers.dev")) return null;
      const context = {
        type: "hls",
        stream: serverData.url,
        headers,
        flags: [flags.CORS_ALLOWED],
        captions: []
      };
      return {
        embedId: "mirror",
        url: JSON.stringify(context)
      };
    };
    for (const sourceKey of Object.keys(parsedRes)) {
      const sourceData = parsedRes[sourceKey];
      if ((sourceData == null ? void 0 : sourceData.url) && sourceData.url !== null) {
        if (sourceKey === "Atlas" || sourceData.url.includes("cdn.vidrock.store/playlist/")) {
          try {
            const playlistRes = await ctx.proxiedFetcher(sourceData.url, {
              headers: {
                ...headers,
                "User-Agent": userAgent
              }
            });
            let playlistData = playlistRes;
            if (typeof playlistRes === "string") {
              try {
                playlistData = JSON.parse(playlistRes);
              } catch (e) {
                continue;
              }
            }
            if (Array.isArray(playlistData) && playlistData.length > 0) {
              const qualities = {};
              for (const stream of playlistData) {
                if ((stream == null ? void 0 : stream.url) && (stream == null ? void 0 : stream.resolution)) {
                  const resolution = stream.resolution.toString();
                  qualities[resolution] = {
                    type: "mp4",
                    url: stream.url
                  };
                }
              }
              if (Object.keys(qualities).length > 0) {
                const context = {
                  type: "file",
                  qualities,
                  headers,
                  flags: [flags.CORS_ALLOWED],
                  captions: []
                };
                embeds.push({
                  embedId: "mirror",
                  url: JSON.stringify(context)
                });
              }
            }
          } catch (e) {
            continue;
          }
        } else {
          const embed2 = createMirrorEmbed(sourceKey, sourceData);
          if (embed2) embeds.push(embed2);
        }
      }
    }
    if (embeds.length === 0) {
      throw new NotFoundError("No valid sources found from Vidrock API");
    }
    return {
      embeds
    };
  }
  const vidrockScraper = makeSourcerer({
    id: "vidrock",
    name: "Granite",
    rank: 170,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper$1,
    scrapeShow: comboScraper$1
  });
  const baseUrl = "https://wecima.tube";
  async function comboScraper(ctx) {
    const searchPage = await ctx.proxiedFetcher(`/search/${encodeURIComponent(ctx.media.title)}/`, {
      baseUrl
    });
    const search$ = cheerio.load(searchPage);
    const firstResult = search$(".Grid--WecimaPosts .GridItem a").first();
    if (!firstResult.length) throw new NotFoundError("No results found");
    const contentUrl = firstResult.attr("href");
    if (!contentUrl) throw new NotFoundError("No content URL found");
    ctx.progress(30);
    const contentPage = await ctx.proxiedFetcher(contentUrl, { baseUrl });
    const content$ = cheerio.load(contentPage);
    let embedUrl;
    if (ctx.media.type === "movie") {
      embedUrl = content$('meta[itemprop="embedURL"]').attr("content");
    } else {
      const seasonLinks = content$(".List--Seasons--Episodes a");
      let seasonUrl;
      for (const element of seasonLinks) {
        const text = content$(element).text().trim();
        if (text.includes(`موسم ${ctx.media.season}`)) {
          seasonUrl = content$(element).attr("href");
          break;
        }
      }
      if (!seasonUrl) throw new NotFoundError(`Season ${ctx.media.season} not found`);
      const seasonPage = await ctx.proxiedFetcher(seasonUrl, { baseUrl });
      const season$ = cheerio.load(seasonPage);
      const episodeLinks = season$(".Episodes--Seasons--Episodes a");
      for (const element of episodeLinks) {
        const epTitle = season$(element).find("episodetitle").text().trim();
        if (epTitle === `الحلقة ${ctx.media.episode}`) {
          const episodeUrl = season$(element).attr("href");
          if (episodeUrl) {
            const episodePage = await ctx.proxiedFetcher(episodeUrl, { baseUrl });
            const episode$ = cheerio.load(episodePage);
            embedUrl = episode$('meta[itemprop="embedURL"]').attr("content");
          }
          break;
        }
      }
    }
    if (!embedUrl) throw new NotFoundError("No embed URL found");
    ctx.progress(60);
    const embedPage = await ctx.proxiedFetcher(embedUrl);
    const embed$ = cheerio.load(embedPage);
    const videoSource = embed$('source[type="video/mp4"]').attr("src");
    if (!videoSource) throw new NotFoundError("No video source found");
    ctx.progress(90);
    return {
      embeds: [],
      stream: [
        {
          id: "primary",
          type: "file",
          flags: [],
          headers: {
            referer: baseUrl
          },
          qualities: {
            unknown: {
              type: "mp4",
              url: videoSource
            }
          },
          captions: []
        }
      ]
    };
  }
  const wecimaScraper = makeSourcerer({
    id: "wecima",
    name: "Wecima (Arabic)",
    rank: 3,
    disabled: false,
    flags: [],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper
  });
  function gatherAllSources() {
    return [
      embedApiScraper,
      FedAPIScraper,
      vidlinkScraper,
      vidlinkScraper2,
      vidrockScraper,
      streamboxScraper,
      pelisplushdScraper,
      cuevana3Scraper,
      rgshowsScraper,
      animeflvScraper,
      cinehdplusScraper,
      fsOnlineScraper,
      fsharetvScraper,
      wecimaScraper
    ];
  }
  function gatherAllEmbeds() {
    return [
      filemoonScraper,
      mixdropScraper,
      serverMirrorEmbed,
      streamtapeScraper,
      streamtapeLatinoScraper,
      viperScraper,
      warezcdnembedMp4Scraper,
      ...VidnestEmbeds,
      ...fsOnlineEmbeds,
      VidsrcsuServer1Scraper,
      VidsrcsuServer2Scraper,
      VidsrcsuServer3Scraper,
      VidsrcsuServer4Scraper,
      VidsrcsuServer5Scraper,
      VidsrcsuServer6Scraper,
      VidsrcsuServer7Scraper,
      VidsrcsuServer8Scraper,
      VidsrcsuServer9Scraper,
      VidsrcsuServer10Scraper,
      VidsrcsuServer11Scraper,
      VidsrcsuServer12Scraper,
      VidsrcsuServer20Scraper
    ];
  }
  function getBuiltinSources() {
    return gatherAllSources().filter((v) => !v.disabled && !v.externalSource);
  }
  function getBuiltinExternalSources() {
    return gatherAllSources().filter((v) => v.externalSource && !v.disabled);
  }
  function getBuiltinEmbeds() {
    return gatherAllEmbeds().filter((v) => !v.disabled);
  }
  function findDuplicates(items, keyFn) {
    const groups = /* @__PURE__ */ new Map();
    for (const item of items) {
      const key2 = keyFn(item);
      if (!groups.has(key2)) {
        groups.set(key2, []);
      }
      groups.get(key2).push(item);
    }
    return Array.from(groups.entries()).filter(([_, groupItems]) => groupItems.length > 1).map(([key2, groupItems]) => ({ key: key2, items: groupItems }));
  }
  function formatDuplicateError(type, duplicates, keyName) {
    const duplicateList = duplicates.map(({ key: key2, items }) => {
      const itemNames = items.map((item) => item.name || item.id).join(", ");
      return `  ${keyName} ${key2}: ${itemNames}`;
    }).join("\n");
    return `${type} have duplicate ${keyName}s:
${duplicateList}`;
  }
  function getProviders(features, list) {
    const sources = list.sources.filter((v) => !(v == null ? void 0 : v.disabled));
    const embeds = list.embeds.filter((v) => !(v == null ? void 0 : v.disabled));
    const combined = [...sources, ...embeds];
    const duplicateIds = findDuplicates(combined, (v) => v.id);
    if (duplicateIds.length > 0) {
      throw new Error(formatDuplicateError("Sources/embeds", duplicateIds, "ID"));
    }
    const duplicateSourceRanks = findDuplicates(sources, (v) => v.rank);
    if (duplicateSourceRanks.length > 0) {
      throw new Error(formatDuplicateError("Sources", duplicateSourceRanks, "rank"));
    }
    const duplicateEmbedRanks = findDuplicates(embeds, (v) => v.rank);
    if (duplicateEmbedRanks.length > 0) {
      throw new Error(formatDuplicateError("Embeds", duplicateEmbedRanks, "rank"));
    }
    return {
      sources: sources.filter((s) => flagsAllowedInFeatures(features, s.flags)),
      embeds: embeds.filter((e) => flagsAllowedInFeatures(features, e.flags))
    };
  }
  function makeProviders(ops) {
    var _a;
    const features = getTargetFeatures(
      ops.proxyStreams ? "any" : ops.target,
      ops.consistentIpForRequests ?? false,
      ops.proxyStreams
    );
    const sources = [...getBuiltinSources()];
    if (ops.externalSources === "all") sources.push(...getBuiltinExternalSources());
    else {
      (_a = ops.externalSources) == null ? void 0 : _a.forEach((source) => {
        const matchingSource = getBuiltinExternalSources().find((v) => v.id === source);
        if (!matchingSource) return;
        sources.push(matchingSource);
      });
    }
    const list = getProviders(features, {
      embeds: getBuiltinEmbeds(),
      sources
    });
    return makeControls({
      embeds: list.embeds,
      sources: list.sources,
      features,
      fetcher: ops.fetcher,
      proxiedFetcher: ops.proxiedFetcher,
      proxyStreams: ops.proxyStreams
    });
  }
  function buildProviders() {
    let consistentIpForRequests = false;
    let target = null;
    let fetcher = null;
    let proxiedFetcher = null;
    const embeds = [];
    const sources = [];
    const builtinSources = getBuiltinSources();
    const builtinExternalSources = getBuiltinExternalSources();
    const builtinEmbeds = getBuiltinEmbeds();
    return {
      enableConsistentIpForRequests() {
        consistentIpForRequests = true;
        return this;
      },
      setFetcher(f) {
        fetcher = f;
        return this;
      },
      setProxiedFetcher(f) {
        proxiedFetcher = f;
        return this;
      },
      setTarget(t) {
        target = t;
        return this;
      },
      addSource(input) {
        if (typeof input !== "string") {
          sources.push(input);
          return this;
        }
        const matchingSource = [...builtinSources, ...builtinExternalSources].find((v) => v.id === input);
        if (!matchingSource) throw new Error("Source not found");
        sources.push(matchingSource);
        return this;
      },
      addEmbed(input) {
        if (typeof input !== "string") {
          embeds.push(input);
          return this;
        }
        const matchingEmbed = builtinEmbeds.find((v) => v.id === input);
        if (!matchingEmbed) throw new Error("Embed not found");
        embeds.push(matchingEmbed);
        return this;
      },
      addBuiltinProviders() {
        sources.push(...builtinSources);
        embeds.push(...builtinEmbeds);
        return this;
      },
      build() {
        if (!target) throw new Error("Target not set");
        if (!fetcher) throw new Error("Fetcher not set");
        const features = getTargetFeatures(target, consistentIpForRequests);
        const list = getProviders(features, {
          embeds,
          sources
        });
        return makeControls({
          fetcher,
          proxiedFetcher: proxiedFetcher ?? void 0,
          embeds: list.embeds,
          sources: list.sources,
          features
        });
      }
    };
  }
  const isReactNative = () => {
    try {
      require("react-native");
      return true;
    } catch (e) {
      return false;
    }
  };
  function serializeBody(body) {
    if (body === void 0 || typeof body === "string" || body instanceof URLSearchParams || body instanceof FormData) {
      if (body instanceof URLSearchParams && isReactNative()) {
        return {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: body.toString()
        };
      }
      return {
        headers: {},
        body
      };
    }
    return {
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
  }
  function getHeaders(list, res) {
    const output = new Headers();
    list.forEach((header) => {
      var _a;
      const realHeader = header.toLowerCase();
      const realValue = res.headers.get(realHeader);
      const extraValue = (_a = res.extraHeaders) == null ? void 0 : _a.get(realHeader);
      const value = extraValue ?? realValue;
      if (!value) return;
      output.set(realHeader, value);
    });
    return output;
  }
  function makeStandardFetcher(f) {
    const normalFetch = async (url, ops) => {
      var _a;
      const fullUrl = makeFullUrl(url, ops);
      const seralizedBody = serializeBody(ops.body);
      const controller = new AbortController();
      const timeout = 15e3;
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await f(fullUrl, {
          method: ops.method,
          headers: {
            ...seralizedBody.headers,
            ...ops.headers
          },
          body: seralizedBody.body,
          credentials: ops.credentials,
          signal: controller.signal
          // Pass the signal to fetch
        });
        clearTimeout(timeoutId);
        let body;
        const contentType = (_a = res.headers.get("content-type")) == null ? void 0 : _a.toLowerCase();
        const isJson = contentType == null ? void 0 : contentType.includes("application/json");
        const isBinary = (contentType == null ? void 0 : contentType.includes("application/wasm")) || (contentType == null ? void 0 : contentType.includes("application/octet-stream")) || (contentType == null ? void 0 : contentType.includes("binary"));
        if (res.status === 204) {
          body = null;
        } else if (isJson) {
          body = await res.json();
        } else if (isBinary) {
          body = await res.arrayBuffer();
        } else {
          body = await res.text();
        }
        return {
          body,
          finalUrl: res.extraUrl ?? res.url,
          headers: getHeaders(ops.readHeaders, res),
          statusCode: res.status
        };
      } catch (error) {
        if (error.name === "AbortError") {
          throw new Error(`Fetch request to ${fullUrl} timed out after ${timeout}ms`);
        }
        throw error;
      }
    };
    return normalFetch;
  }
  const headerMap = {
    cookie: "X-Cookie",
    referer: "X-Referer",
    origin: "X-Origin",
    "user-agent": "X-User-Agent",
    "x-real-ip": "X-X-Real-Ip"
  };
  const responseHeaderMap = {
    "x-set-cookie": "Set-Cookie"
  };
  function makeSimpleProxyFetcher(proxyUrl, f) {
    const proxiedFetch = async (url, ops) => {
      const fetcher = makeStandardFetcher(async (a, b) => {
        const controller = new AbortController();
        const timeout = 2e4;
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
          const res = await f(a, {
            method: (b == null ? void 0 : b.method) || "GET",
            headers: (b == null ? void 0 : b.headers) || {},
            body: b == null ? void 0 : b.body,
            credentials: b == null ? void 0 : b.credentials,
            signal: controller.signal
            // Pass the signal to fetch
          });
          clearTimeout(timeoutId);
          res.extraHeaders = new Headers();
          Object.entries(responseHeaderMap).forEach((entry) => {
            var _a;
            const value = res.headers.get(entry[0]);
            if (!value) return;
            (_a = res.extraHeaders) == null ? void 0 : _a.set(entry[1].toLowerCase(), value);
          });
          res.extraUrl = res.headers.get("X-Final-Destination") ?? res.url;
          return res;
        } catch (error) {
          if (error.name === "AbortError") {
            throw new Error(`Fetch request to ${a} timed out after ${timeout}ms`);
          }
          throw error;
        }
      });
      const fullUrl = makeFullUrl(url, ops);
      const headerEntries = Object.entries(ops.headers).map((entry) => {
        const key2 = entry[0].toLowerCase();
        if (headerMap[key2]) return [headerMap[key2], entry[1]];
        return entry;
      });
      return fetcher(proxyUrl, {
        ...ops,
        query: {
          destination: fullUrl
        },
        headers: Object.fromEntries(headerEntries),
        baseUrl: void 0
      });
    };
    return proxiedFetch;
  }
  exports2.NotFoundError = NotFoundError;
  exports2.buildProviders = buildProviders;
  exports2.createM3U8ProxyUrl = createM3U8ProxyUrl;
  exports2.flags = flags;
  exports2.getBuiltinEmbeds = getBuiltinEmbeds;
  exports2.getBuiltinExternalSources = getBuiltinExternalSources;
  exports2.getBuiltinSources = getBuiltinSources;
  exports2.getM3U8ProxyUrl = getM3U8ProxyUrl;
  exports2.labelToLanguageCode = labelToLanguageCode;
  exports2.makeProviders = makeProviders;
  exports2.makeSimpleProxyFetcher = makeSimpleProxyFetcher;
  exports2.makeStandardFetcher = makeStandardFetcher;
  exports2.setM3U8ProxyUrl = setM3U8ProxyUrl;
  exports2.targets = targets;
  exports2.updateM3U8ProxyUrl = updateM3U8ProxyUrl;
  Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
});
