/**
 * LinkForge playground: a dependency-free client for the two API endpoints.
 */
import './style.css';

interface MetaImage {
  url: string;
}

interface MetaSuccess {
  status: 'success';
  data: {
    url: string;
    title: string | null;
    description: string | null;
    image: MetaImage | null;
    favicon: string | null;
  };
  meta: { cached: boolean; source: 'http' | 'browser'; durationMs: number };
}

interface ApiFailure {
  status: 'fail' | 'error';
  code: string;
  message: string;
}

/** Looks an element up by id and fails loudly if the markup drifted. */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing element #${id}`);
  return node as T;
}

const form = el<HTMLFormElement>('form');
const urlInput = el<HTMLInputElement>('url');
const deviceSelect = el<HTMLSelectElement>('device');
const submit = el<HTMLButtonElement>('submit');
const errorBox = el<HTMLParagraphElement>('error');
const results = el<HTMLElement>('results');
const card = el<HTMLAnchorElement>('card');
const cardImage = el<HTMLImageElement>('card-image');
const cardFavicon = el<HTMLImageElement>('card-favicon');
const screenshot = el<HTMLImageElement>('screenshot');

/** Shows a remote image, hiding the element when the URL is absent or broken. */
function setImage(image: HTMLImageElement, src: string | null | undefined): void {
  image.hidden = src === null || src === undefined;
  image.onerror = () => {
    image.hidden = true;
  };
  if (src !== null && src !== undefined) image.src = src;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function renderMeta(body: MetaSuccess): void {
  const { data, meta } = body;
  card.href = data.url;
  el('card-host').textContent = new URL(data.url).host;
  el('card-title').textContent = data.title ?? 'Untitled';
  el('card-description').textContent = data.description ?? '';
  setImage(cardImage, data.image?.url);
  setImage(cardFavicon, data.favicon);
  el('badge').textContent = `${meta.source} · ${meta.cached ? 'cache hit' : `${meta.durationMs} ms`}`;
  el('json').textContent = JSON.stringify(body, null, 2);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const target = encodeURIComponent(urlInput.value.trim());

  errorBox.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Inspecting…';

  // The screenshot endpoint returns an image: the browser can load it directly.
  screenshot.onerror = () => showError('The screenshot could not be captured.');
  screenshot.src = `/api/v1/screenshot?url=${target}&device=${deviceSelect.value}`;

  fetch(`/api/v1/meta?url=${target}`)
    .then(async (response) => {
      const body = (await response.json()) as MetaSuccess | ApiFailure;
      if (body.status !== 'success') throw new Error(`${body.code}: ${body.message}`);
      renderMeta(body);
      results.hidden = false;
    })
    .catch((error: unknown) => {
      results.hidden = true;
      showError(error instanceof Error ? error.message : 'Unexpected error');
    })
    .finally(() => {
      submit.disabled = false;
      submit.textContent = 'Inspect';
    });
});
