import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const envFile = await readFile(path.join(rootDir, '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(/=(.*)/s).map((part) => part.trim())));
const port = Number(env.PORT || 3000);
const metApi = env.MET_API_BASE;
const aicApi = env.AIC_API_BASE;
const searchTerms = ['landscape', 'seascape', 'garden', 'river', 'city', 'portrait', 'painting'];

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

async function getPreferredArtists() {
  const text = await readFile(path.join(rootDir, 'data', 'artists.txt'), 'utf8');
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

async function fromMet(artists) {
  const query = randomItem(artists.length ? artists : searchTerms);
  const searchUrl = new URL(`${metApi}/search`);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('hasImages', 'true');
  const search = await fetch(searchUrl).then((response) => response.json());
  if (!search.objectIDs?.length) throw new Error('The Met returned no matching objects.');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = randomItem(search.objectIDs);
    const object = await fetch(`${metApi}/objects/${id}`).then((response) => response.json());
    if (!object.primaryImage || object.isPublicDomain !== true || !object.objectName?.toLowerCase().includes('painting')) continue;
    return {
      source: 'The Metropolitan Museum of Art',
      title: object.title || 'Untitled',
      artist: object.artistDisplayName || object.culture || 'Unknown artist',
      year: object.objectDate || '',
      imageUrl: object.primaryImage,
      objectUrl: object.objectURL || ''
    };
  }
  throw new Error('The Met did not return a usable artwork.');
}

async function fromArtInstitute(artists) {
  const query = randomItem(artists.length ? artists : searchTerms);
  const searchUrl = new URL(`${aicApi}/artworks/search`);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('limit', '100');
  searchUrl.searchParams.set('fields', 'id,title,image_id,artist_display,date_display,is_public_domain,artwork_type_title');
  const search = await fetch(searchUrl).then((response) => response.json());
  if (!search.data?.length) throw new Error('Art Institute returned no matching artworks.');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const artwork = randomItem(search.data);
    const detail = await fetch(`${aicApi}/artworks/${artwork.id}?fields=id,title,image_id,artist_display,date_display,artist_title,is_public_domain,artwork_type_title`).then((response) => response.json());
    const item = detail.data;
    if (!item?.image_id || !item.is_public_domain || !item.artwork_type_title?.toLowerCase().includes('painting')) continue;
    return {
      source: 'Art Institute of Chicago',
      title: item.title || 'Untitled',
      artist: item.artist_title || item.artist_display || 'Unknown artist',
      year: item.date_display || '',
      imageUrl: `https://www.artic.edu/iiif/2/${item.image_id}/full/1920,/0/default.jpg`,
      objectUrl: `https://www.artic.edu/artworks/${item.id}`
    };
  }
  throw new Error('Art Institute did not return a usable painting.');
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  response.setHeader('Vary', 'Origin');
}

function createProxyImageUrl(request, imageUrl) {
  const protocol = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0];
  const serverUrl = new URL(`${protocol}://${request.headers.host}`);
  serverUrl.pathname = '/api/image';
  serverUrl.searchParams.set('url', imageUrl);
  return serverUrl.toString();
}

async function respondWithArtwork(request, response) {
  try {
    const artists = await getPreferredArtists();
    const providers = [() => fromMet(artists), () => fromArtInstitute(artists)];
    let lastError;
    for (const provider of providers.sort(() => Math.random() - 0.5)) {
      try {
        const artwork = await provider();
        artwork.imageUrl = createProxyImageUrl(request, artwork.imageUrl);
        return sendJson(response, 200, artwork);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } catch (error) {
    sendJson(response, 502, { error: error.message || 'Unable to load artwork.' });
  }
}

function sendJson(response, status, body) {
  setCors(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function proxyImage(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`).searchParams.get('url');
  try {
    const imageUrl = new URL(url);
    if (!['images.metmuseum.org', 'www.artic.edu'].includes(imageUrl.hostname)) throw new Error('Image host is not allowed.');
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) throw new Error('Image request failed.');
    setCors(response);
    response.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    sendJson(response, 502, { error: error.message || 'Image proxy failed.' });
  }
}

const contentTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'OPTIONS') {
    setCors(response);
    response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' }).end();
    return;
  }
  if (requestUrl.pathname === '/api/artwork') return respondWithArtwork(request, response);
  if (requestUrl.pathname === '/api/image') return proxyImage(request, response);
  const relativePath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1);
  const publicPath = path.resolve(rootDir, 'public', relativePath);
  if (!publicPath.startsWith(path.resolve(rootDir, 'public') + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const file = await readFile(publicPath);
    response.writeHead(200, { 'Content-Type': `${contentTypes[path.extname(publicPath)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(file);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, () => console.log(`Art Gallery is available at http://localhost:${port}`));
