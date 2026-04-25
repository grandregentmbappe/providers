import { Embed, Sourcerer } from '@/providers/base';
import { filemoonScraper } from './embeds/filemoon';
import { mixdropScraper } from './embeds/mixdrop';
import { serverMirrorEmbed } from './embeds/server-mirrors';
import { streamtapeScraper, streamtapeLatinoScraper } from './embeds/streamtape';
import { VidnestEmbeds } from './embeds/vidnest';
import {
  VidsrcsuServer10Scraper,
  VidsrcsuServer11Scraper,
  VidsrcsuServer12Scraper,
  VidsrcsuServer1Scraper,
  VidsrcsuServer20Scraper,
  VidsrcsuServer2Scraper,
  VidsrcsuServer3Scraper,
  VidsrcsuServer4Scraper,
  VidsrcsuServer5Scraper,
  VidsrcsuServer6Scraper,
  VidsrcsuServer7Scraper,
  VidsrcsuServer8Scraper,
  VidsrcsuServer9Scraper,
} from './embeds/vidsrcsu';
import { viperScraper } from './embeds/viper';

import { animeflvScraper } from './sources/animeflv';
import { cinehdplusScraper } from './sources/cinehdplus-es';
import { cuevana3Scraper } from './sources/cuevana3';
import { embedApiScraper } from './sources/embedapi';
import { FedAPIScraper } from './sources/fedapi';
import { fsOnlineEmbeds, fsOnlineScraper } from './sources/fsonline/index';
import { fsharetvScraper } from './sources/fsharetv';
import { pelisplushdScraper } from './sources/pelisplushd';
import { rgshowsScraper } from './sources/rgshows';
import { streamboxScraper } from './sources/streambox';
import { vidlinkScraper } from './sources/vidlink';
import { vidlinkScraper2 } from './sources/vidlink2';
import { vidrockScraper } from './sources/vidrock';
import { wecimaScraper } from './sources/wecima';

export function gatherAllSources(): Array<Sourcerer> {
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
    wecimaScraper,
  ];
}

export function gatherAllEmbeds(): Array<Embed> {
  return [
    filemoonScraper,
    mixdropScraper,
    serverMirrorEmbed,
    streamtapeScraper,
    streamtapeLatinoScraper,
    viperScraper,
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
    VidsrcsuServer20Scraper,
  ];
}
