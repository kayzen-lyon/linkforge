/**
 * Playground files embedded in the API bundle.
 *
 * This committed version is an empty placeholder. Deployments that ship the
 * playground with the API overwrite it at build time by running
 * `scripts/embed-playground.mjs` (see `vercel.json`). Do not edit by hand.
 */
export interface EmbeddedAsset {
  /** URL path, e.g. `/index.html`. */
  readonly path: string;
  readonly contentType: string;
  /** File content, base64-encoded. */
  readonly base64: string;
}

export const PLAYGROUND_ASSETS: readonly EmbeddedAsset[] = [];
