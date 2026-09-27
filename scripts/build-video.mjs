import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { publicCatalog } from '../lib/video-feed.js';
publicCatalog(JSON.parse(await readFile(new URL('../data/video-feed.json', import.meta.url), 'utf8')));
const directory = new URL('../video/vendor/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(new URL('../node_modules/hls.js/dist/hls.min.js', import.meta.url), new URL('hls.min.js', directory));
await copyFile(new URL('../node_modules/hls.js/LICENSE', import.meta.url), new URL('LICENSE.txt', directory));
console.log('Validated the public video catalog and prepared the pinned HLS player.');
