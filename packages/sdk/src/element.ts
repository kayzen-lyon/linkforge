/**
 * Entry point `@omnillink/sdk/element`: importing it registers `<link-preview>`.
 */
import { LinkPreviewElement } from './element/link-preview.js';

export const TAG_NAME = 'link-preview';

if (typeof customElements !== 'undefined' && customElements.get(TAG_NAME) === undefined) {
  customElements.define(TAG_NAME, LinkPreviewElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'link-preview': LinkPreviewElement;
  }
  interface HTMLElementEventMap {
    'link-preview:load': CustomEvent<import('./element/link-preview.js').LinkPreviewLoadDetail>;
    'link-preview:error': CustomEvent<import('./element/link-preview.js').LinkPreviewErrorDetail>;
  }
}

export {
  LinkPreviewElement,
  type LinkPreviewErrorDetail,
  type LinkPreviewLoadDetail,
  type LinkPreviewState,
} from './element/link-preview.js';
export { buildCardModel, type CardModel } from './element/model.js';
export { safeHttpUrl } from './element/safe-url.js';
