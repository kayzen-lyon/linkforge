/**
 * `<link-preview>`: a link card fed by `GET /meta`.
 *
 * Security model: the metadata describes an arbitrary third-party page and is
 * treated as hostile. The DOM is built node by node; text only ever goes
 * through `textContent`, and a URL only reaches `href` / `src` after
 * `safeHttpUrl()` accepted it. There is no `innerHTML` in this file.
 */
import { createClient } from '../client.js';
import type { LinkForgeResult, LinkMetadata } from '../types.js';
import { buildCardModel, type CardModel } from './model.js';
import { safeHttpUrl } from './safe-url.js';
import { STYLES } from './styles.js';

export type LinkPreviewState = 'idle' | 'loading' | 'ready' | 'error';

export interface LinkPreviewLoadDetail {
  readonly data: LinkMetadata;
  readonly meta: LinkForgeResult<LinkMetadata>['meta'];
}

export interface LinkPreviewErrorDetail {
  readonly error: unknown;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Starts loading a little before the card enters the viewport. */
const LAZY_ROOT_MARGIN = '200px';

// Importing this module on a server (SSR) must not throw: without a DOM the
// class extends an inert stand-in and is simply never instantiated.
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

let sharedSheet: CSSStyleSheet | null | undefined;

/** One constructable stylesheet for every card; `null` where unsupported. */
function getSharedSheet(): CSSStyleSheet | null {
  if (sharedSheet === undefined) {
    try {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(STYLES);
    } catch {
      sharedSheet = null;
    }
  }
  return sharedSheet;
}

type Props = Readonly<Record<string, string>>;

/** Creates an element; `text` goes through `textContent`, never parsed as HTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function arrowIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'arrow');
  svg.setAttribute('part', 'arrow');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4.5 11.5l7-7M6 4.5h5.5V10');
  svg.append(path);
  return svg;
}

/** A remote image that can only point to http(s), sends no referrer, and removes itself on failure. */
function remoteImage(url: string, props: Props, onError?: () => void): HTMLImageElement {
  const img = el('img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', ...props });
  img.addEventListener(
    'error',
    () => {
      img.remove();
      onError?.();
    },
    { once: true },
  );
  img.src = url;
  return img;
}

export class LinkPreviewElement extends Base {
  static readonly observedAttributes = ['url', 'base-url', 'loading'];

  readonly #root: ShadowRoot;
  #controller: AbortController | null = null;
  #observer: IntersectionObserver | null = null;
  #updateQueued = false;
  /** Request the current content belongs to: `base-url` + `url`. */
  #key: string | null = null;
  #state: LinkPreviewState = 'idle';

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    const sheet = getSharedSheet();
    if (sheet !== null) {
      this.#root.adoptedStyleSheets = [sheet];
    }
  }

  // ---- properties mirroring the attributes ------------------------------

  /** Page to preview. Only absolute http(s) URLs are accepted. */
  get url(): string {
    return this.getAttribute('url') ?? '';
  }
  set url(value: string) {
    this.setAttribute('url', value);
  }

  /** Origin of the LinkForge instance. Empty means the origin of the page. */
  get baseUrl(): string {
    return this.getAttribute('base-url') ?? '';
  }
  set baseUrl(value: string) {
    this.setAttribute('base-url', value);
  }

  get size(): 'compact' | 'large' {
    return this.getAttribute('size') === 'large' ? 'large' : 'compact';
  }
  set size(value: 'compact' | 'large') {
    this.setAttribute('size', value);
  }

  get theme(): 'auto' | 'light' | 'dark' {
    const value = this.getAttribute('theme');
    return value === 'light' || value === 'dark' ? value : 'auto';
  }
  set theme(value: 'auto' | 'light' | 'dark') {
    this.setAttribute('theme', value);
  }

  /** Current phase, also reflected as the `state` attribute for styling. */
  get state(): LinkPreviewState {
    return this.#state;
  }

  // ---- lifecycle ---------------------------------------------------------

  connectedCallback(): void {
    this.#queueUpdate();
  }

  disconnectedCallback(): void {
    this.#cancel();
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null): void {
    if (previous !== next && this.isConnected) this.#queueUpdate();
  }

  /** Coalesces a burst of attribute changes (and the upgrade itself) into one update. */
  #queueUpdate(): void {
    if (this.#updateQueued) return;
    this.#updateQueued = true;
    queueMicrotask(() => {
      this.#updateQueued = false;
      if (this.isConnected) this.#update();
    });
  }

  #cancel(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.#observer?.disconnect();
    this.#observer = null;
  }

  #setState(state: LinkPreviewState): void {
    this.#state = state;
    this.setAttribute('state', state);
  }

  #update(): void {
    const url = safeHttpUrl(this.getAttribute('url'));
    if (url === null) {
      this.#cancel();
      this.#key = null;
      this.#renderFallback(null);
      this.#setState('idle');
      return;
    }

    const key = `${this.baseUrl}\n${url}`;
    const settled = this.#state === 'ready' || this.#state === 'error';
    const inFlight = this.#controller !== null || this.#observer !== null;
    if (key === this.#key && (settled || inFlight)) {
      // Same request: only the `loading` attribute can have changed.
      if (this.#observer !== null && this.getAttribute('loading') === 'eager') {
        this.#cancel();
        void this.#load(url, key);
      }
      return;
    }

    this.#cancel();
    this.#key = key;
    this.#render(this.#skeleton(url));
    this.#setState('idle');

    const lazy = this.getAttribute('loading') !== 'eager' && typeof IntersectionObserver === 'function';
    if (!lazy) {
      void this.#load(url, key);
      return;
    }
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.#observer?.disconnect();
        this.#observer = null;
        void this.#load(url, key);
      },
      { rootMargin: LAZY_ROOT_MARGIN },
    );
    this.#observer.observe(this);
  }

  async #load(url: string, key: string): Promise<void> {
    const controller = new AbortController();
    this.#controller = controller;
    this.#setState('loading');
    // A newer request, a disconnect or an attribute change replaces the controller.
    const stale = (): boolean => this.#controller !== controller || this.#key !== key;

    try {
      const client = createClient({ baseUrl: this.baseUrl });
      const result = await client.meta(url, { signal: controller.signal });
      if (stale()) return;
      this.#controller = null;
      this.#render(this.#card(buildCardModel(result.data, url)));
      this.#setState('ready');
      this.#emit<LinkPreviewLoadDetail>('link-preview:load', { data: result.data, meta: result.meta });
    } catch (error) {
      if (stale()) return;
      this.#controller = null;
      this.#renderFallback(url);
      this.#setState('error');
      this.#emit<LinkPreviewErrorDetail>('link-preview:error', { error });
    }
  }

  #emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
  }

  // ---- rendering ---------------------------------------------------------

  #render(content: Node | null): void {
    const nodes: Node[] = [];
    if (this.#root.adoptedStyleSheets.length === 0) {
      // No constructable stylesheets: fall back to a <style> with static text.
      nodes.push(el('style', {}, STYLES));
    }
    if (content !== null) nodes.push(content);
    this.#root.replaceChildren(...nodes);
  }

  /** Placeholder shown until the metadata arrives. Already a working link. */
  #skeleton(url: string): HTMLElement {
    const card = el('a', {
      class: 'card skeleton',
      part: 'card skeleton',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-busy': 'true',
    });
    card.append(el('span', { class: 'sr-only' }, url));
    card.append(el('span', { class: 'media', 'aria-hidden': 'true' }));
    const body = el('span', { class: 'body', 'aria-hidden': 'true' });
    for (const width of ['w30', 'w80', 'w95', 'w55']) body.append(el('span', { class: `bone ${width}` }));
    card.append(body);
    return card;
  }

  #card(model: CardModel): HTMLElement {
    const card = el('a', {
      class: 'card',
      part: 'card',
      href: model.href,
      target: '_blank',
      rel: 'noopener noreferrer',
    });

    const media = el('span', { class: 'media', part: 'media', 'aria-hidden': 'true' });
    media.append(el('span', { class: 'monogram', part: 'monogram' }, model.monogram));
    if (model.imageUrl !== null) {
      media.append(
        remoteImage(model.imageUrl, { part: 'image' }, () => card.classList.add('no-image')),
      );
    } else {
      card.classList.add('no-image');
    }

    const body = el('span', { class: 'body', part: 'body' });
    if (model.lang !== null) body.setAttribute('lang', model.lang);

    const source = el('span', { class: 'source', part: 'source' });
    if (model.iconUrl !== null) source.append(remoteImage(model.iconUrl, { class: 'icon', part: 'icon' }));
    if (model.publisher !== null) {
      source.append(el('span', { class: 'publisher', part: 'publisher', dir: 'auto' }, model.publisher));
    }
    source.append(el('span', { class: 'host', part: 'host', translate: 'no' }, model.host), arrowIcon());

    body.append(source, el('span', { class: 'title', part: 'title', dir: 'auto' }, model.title));
    if (model.description !== null) {
      body.append(el('span', { class: 'description', part: 'description', dir: 'auto' }, model.description));
    }

    card.append(media, body);
    return card;
  }

  /**
   * What is shown when there is no preview: the element's own children when it
   * has some (so authors can provide their link), else a plain link to the URL.
   */
  #renderFallback(url: string | null): void {
    const hasLightContent = this.childElementCount > 0 || (this.textContent ?? '').trim() !== '';
    if (hasLightContent) {
      this.#render(el('slot'));
    } else if (url !== null) {
      this.#render(
        el('a', { class: 'plain', part: 'fallback', href: url, target: '_blank', rel: 'noopener noreferrer' }, url),
      );
    } else {
      this.#render(null);
    }
  }
}
