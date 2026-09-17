import { GALLERY_SETTINGS } from './config.js';

const image = document.querySelector('#artwork');
const caption = document.querySelector('#caption');
const status = document.querySelector('#status');
const fields = {
  title: document.querySelector('#title'),
  artist: document.querySelector('#artist'),
  year: document.querySelector('#year')
};

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

async function requestArtwork() {
  for (let attempt = 0; attempt < GALLERY_SETTINGS.maximumLoadAttempts; attempt += 1) {
    try {
      const response = await fetch('/api/artwork', { cache: 'no-store' });
      if (!response.ok) throw new Error('Museum API request failed.');
      return await preload(await response.json());
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
