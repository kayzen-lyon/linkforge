/**
 * Styles of `<link-preview>`. Static text, never interpolated with data.
 *
 * Public knobs are the `--lp-*` custom properties; the `--_*` ones are private
 * and hold "the author's value, else the default of the active theme".
 */

const LIGHT = `
  --_bg: var(--lp-bg, #ffffff);
  --_fg: var(--lp-fg, #15171c);
  --_muted: var(--lp-muted, #5a6170);
  --_border: var(--lp-border, #dde0e7);
  --_accent: var(--lp-accent, #2d5bd7);
  --_media-bg: var(--lp-media-bg, #eceef3);
  --_skeleton: var(--lp-skeleton, #e4e7ed);
  --_shadow: var(--lp-shadow, 0 1px 2px rgb(21 23 28 / 0.05), 0 4px 14px -8px rgb(21 23 28 / 0.18));
  color-scheme: light;
`;

const DARK = `
  --_bg: var(--lp-bg, #17191f);
  --_fg: var(--lp-fg, #eceef3);
  --_muted: var(--lp-muted, #9ba2b0);
  --_border: var(--lp-border, #2c303a);
  --_accent: var(--lp-accent, #8fb0ff);
  --_media-bg: var(--lp-media-bg, #21242c);
  --_skeleton: var(--lp-skeleton, #282c35);
  --_shadow: var(--lp-shadow, 0 1px 2px rgb(0 0 0 / 0.4));
  color-scheme: dark;
`;

export const STYLES = `
:host {
  ${LIGHT}
  --_radius: var(--lp-radius, 14px);
  --_media: var(--lp-media-size, 132px);
  display: block;
  max-width: var(--lp-max-width, 560px);
  container-type: inline-size;
  font-family: var(--lp-font, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  font-size: var(--lp-font-size, 15px);
  line-height: 1.4;
  text-align: start;
}
:host([hidden]) { display: none; }
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) { ${DARK} }
}
:host([theme="dark"]) { ${DARK} }

*, *::before, *::after { box-sizing: border-box; }

.card {
  display: grid;
  grid-template-columns: var(--_media) minmax(0, 1fr);
  min-height: 116px;
  overflow: hidden;
  border: 1px solid var(--_border);
  border-radius: var(--_radius);
  background: var(--_bg);
  color: var(--_fg);
  box-shadow: var(--_shadow);
  text-decoration: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
a.card:hover { border-color: color-mix(in srgb, var(--_accent) 55%, var(--_border)); }
a.card:focus-visible, .plain:focus-visible {
  outline: 2px solid var(--_accent);
  outline-offset: 2px;
}

.media {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100%;
  overflow: hidden;
  background: var(--_media-bg);
  border-inline-end: 1px solid var(--_border);
}
.media img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--_media-bg);
}
.monogram {
  font-size: 2.6em;
  font-weight: 700;
  line-height: 1;
  color: color-mix(in srgb, var(--_accent) 70%, var(--_media-bg));
  user-select: none;
}

.body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  padding: 13px 16px 14px;
}
.source {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 0.8em;
  color: var(--_muted);
}
.icon {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: contain;
}
.publisher {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 62%;
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--_fg);
}
.host {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-family: var(--lp-font-mono, ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 0.93em;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.publisher + .host::before { content: "/ "; opacity: 0.6; }
.arrow {
  flex: none;
  width: 15px;
  height: 15px;
  margin-inline-start: auto;
  color: var(--_muted);
  transition: transform 160ms ease, color 160ms ease;
}
a.card:hover .arrow, a.card:focus-visible .arrow {
  color: var(--_accent);
  transform: translate(2px, -2px);
}
.title, .description {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.title {
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 1.04em;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.005em;
}
.description {
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 0.9em;
  color: var(--_muted);
}

/* ---- size="large": image on top ------------------------------------- */
:host([size="large"]) .card { grid-template-columns: minmax(0, 1fr); }
:host([size="large"]) .media {
  aspect-ratio: 1.91 / 1;
  min-height: 0;
  border-inline-end: 0;
  border-block-end: 1px solid var(--_border);
}
:host([size="large"]) .card.no-image { min-height: 0; }
:host([size="large"]) .card.no-image .media { display: none; }
:host([size="large"]) .body { padding: 15px 18px 17px; gap: 6px; }
:host([size="large"]) .title { font-size: 1.16em; }
:host([size="large"]) .description { -webkit-line-clamp: 3; line-clamp: 3; }

/* ---- narrow containers ---------------------------------------------- */
@container (max-width: 360px) {
  .card { --_media: var(--lp-media-size, 92px); }
  .body { padding: 11px 12px 12px; }
  .description { -webkit-line-clamp: 1; line-clamp: 1; }
  :host([size="large"]) .description { -webkit-line-clamp: 2; line-clamp: 2; }
}

/* ---- loading skeleton ----------------------------------------------- */
.bone {
  display: block;
  height: 0.8em;
  border-radius: 999px;
  background: var(--_skeleton);
}
.skeleton .media, .bone {
  background-image: linear-gradient(
    100deg,
    transparent 30%,
    color-mix(in srgb, var(--_bg) 55%, transparent) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  background-position: 150% 0;
  animation: lp-sweep 1.4s ease-in-out infinite;
}
.skeleton .media { background-color: var(--_skeleton); }
.bone.w30 { width: 30%; }
.bone.w55 { width: 55%; }
.bone.w80 { width: 80%; height: 1em; }
.bone.w95 { width: 95%; }
@keyframes lp-sweep {
  to { background-position: -50% 0; }
}

/* ---- fallback -------------------------------------------------------- */
.plain {
  color: var(--_accent);
  text-decoration: underline;
  text-underline-offset: 0.15em;
  overflow-wrap: anywhere;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .card, .arrow { transition: none; }
  a.card:hover .arrow, a.card:focus-visible .arrow { transform: none; }
  .skeleton .media, .bone { animation: none; background-image: none; }
}
@media (forced-colors: active) {
  .card { border-color: CanvasText; }
  .bone, .skeleton .media { background: GrayText; }
}
`;
