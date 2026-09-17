import { GALLERY_SETTINGS } from './config.js';

const image = document.querySelector('#artwork');
const caption = document.querySelector('#caption');
const status = document.querySelector('#status');
const fields = {
  title: document.querySelector('#title'),
  artist: document.querySelector('#artist'),
  year: document.querySelector('#year')
};
const museumSearchTerms = ['landscape', 'seascape', 'garden', 'river', 'city', 'portrait', 'painting'];
let preferredArtists;

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

const meetsDisplayRequirements = (candidate) => candidate.naturalWidth >= GALLERY_SETTINGS.targetResolution.width
  && candidate.naturalHeight >= GALLERY_SETTINGS.targetResolution.height
  && candidate.naturalWidth >= candidate.naturalHeight;

function preload(source) {
  return new Promise((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => meetsDisplayRequirements(candidate) ? resolve({ artwork: source, candidate }) : reject(new Error('Artwork does not meet HD landscape requirements.'));
    candidate.onerror = () => reject(new Error('Artwork image could not be loaded.'));
    candidate.src = source.imageUrl;
  });
}

async function getPreferredArtists() {
  if (preferredArtists) return preferredArtists;
  try {
    const text = await fetch('./data/artists.txt').then((response) => response.text());
    preferredArtists = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  } catch {
    preferredArtists = [];
  }
  return preferredArtists;
}

async function getArtworkFromMet(artists) {
  const query = randomItem(artists.length ? artists : museumSearchTerms);
  const searchUrl = new URL('https://collectionapi.metmuseum.org/public/collection/v1/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('hasImages', 'true');
  const search = await fetch(searchUrl).then((response) => response.json());
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const object = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${randomItem(search.objectIDs)}`).then((response) => response.json());
    if (object.primaryImage && object.isPublicDomain && object.objectName?.toLowerCase().includes('painting')) {
      return { title: object.title || 'Untitled', artist: object.artistDisplayName || object.culture || 'Unknown artist', year: object.objectDate || '', imageUrl: object.primaryImage };
    }
  }
  throw new Error('The Met did not return a usable painting.');
}

async function getArtworkFromArtInstitute(artists) {
  const query = randomItem(artists.length ? artists : museumSearchTerms);
  const searchUrl = new URL('https://api.artic.edu/api/v1/artworks/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('limit', '100');
  const search = await fetch(searchUrl).then((response) => response.json());
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = randomItem(search.data).id;
    const detailUrl = `https://api.artic.edu/api/v1/artworks/${id}?fields=id,title,image_id,artist_display,date_display,artist_title,is_public_domain,artwork_type_title`;
    const { data } = await fetch(detailUrl).then((response) => response.json());
    if (data?.image_id && data.is_public_domain && data.artwork_type_title?.toLowerCase().includes('painting')) {
      return { title: data.title || 'Untitled', artist: data.artist_title || data.artist_display || 'Unknown artist', year: data.date_display || '', imageUrl: `https://www.artic.edu/iiif/2/${data.image_id}/full/1920,/0/default.jpg` };
    }
  }
  throw new Error('Art Institute did not return a usable painting.');
}

async function getArtworkFromPublicApi() {
  const artists = await getPreferredArtists();
  const providers = [getArtworkFromMet, getArtworkFromArtInstitute].sort(() => Math.random() - 0.5);
  let lastError;
  for (const provider of providers) {
    try {
      return await provider(artists);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Museum APIs are unavailable.');
}

async function getArtwork() {
  try {
    const response = await fetch('/api/artwork', { cache: 'no-store' });
    if (response.ok) return response.json();
  } catch {
    // GitHub Pages does not run the local Node API.
  }
  return getArtworkFromPublicApi();
}

async function requestArtwork() {
  for (let attempt = 0; attempt < GALLERY_SETTINGS.maximumLoadAttempts; attempt += 1) {
    try {
      return await preload(await getArtwork());
    } catch {
      // Try another random API result.
    }
  }
  throw new Error('No HD landscape artwork is currently available.');
}

function show({ artwork, candidate }) {
  image.classList.remove('visible');
  image.src = candidate.src;
  image.alt = `${artwork.title} by ${artwork.artist}`;
  fields.title.textContent = artwork.title;
  fields.artist.textContent = artwork.artist;
  fields.year.textContent = artwork.year;
  fields.year.hidden = !artwork.year;
  caption.hidden = false;
  status.hidden = true;
  requestAnimationFrame(() => image.classList.add('visible'));
}

async function runGallery() {
  try {
    let current = await requestArtwork();
    while (true) {
      show(current);
      const next = requestArtwork();
      await new Promise((resolve) => setTimeout(resolve, GALLERY_SETTINGS.displayDuration));
      try {
        current = await next;
      } catch {
        current = await requestArtwork();
      }
    }
  } catch (error) {
    status.textContent = error.message;
  }
}

runGallery();
