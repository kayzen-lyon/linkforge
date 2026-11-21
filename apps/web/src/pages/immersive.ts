/**
 * Landing page staging, desktop only:
 *  - the hero wall, assembled when the browser is idle from the response
 *    miniatures already in the page (no extra image, no extra request), so the
 *    title stays the largest paint;
 *  - the capability stage, which shows the response of the card being read.
 * Scrolling stays native: the position is read, never intercepted.
 */
const desktop = window.matchMedia('(min-width: 1024px)');

function node(cls: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = cls;
  return element;
}

/** A copy of a miniature whose images load at once (the originals are lazy). */
function copyOf(mini: Element, cls: string): HTMLElement {
  const copy = mini.cloneNode(true) as HTMLElement;
  copy.className = `cap-mini ${cls}`;
  for (const image of copy.querySelectorAll('img')) image.loading = 'eager';
  return copy;
}

function mountWall(): void {
  const wall = document.querySelector<HTMLElement>('.im-wall');
  const minis = [...document.querySelectorAll('#features .cap-mini')];
  if (wall === null || minis.length === 0) return;

  const COLUMNS = 6;
  const ROWS = 10;
  const step = Math.ceil(minis.length / COLUMNS);
  const grid = node('im-wall-grid');
  for (let column = 0; column < COLUMNS; column += 1) {
    const stack = node('im-wall-col');
    for (let rowAt = 0; rowAt < ROWS; rowAt += 1) {
      const mini = minis[(column * step + rowAt) % minis.length];
      if (mini !== undefined) stack.append(copyOf(mini, 'im-tile'));
    }
    grid.append(stack);
  }
  const stage = node('im-wall-stage');
  stage.append(grid);
  const inner = node('im-wall-inner');
  inner.append(stage);
  wall.append(inner);
  // Let the transparent state paint before the wall fades in.
  requestAnimationFrame(() => requestAnimationFrame(() => wall.classList.add('is-ready')));

  // Off screen, the wall stops moving.
  new IntersectionObserver((entries) => {
    for (const entry of entries) wall.classList.toggle('is-paused', !entry.isIntersecting);
  }).observe(wall);
}

function initStage(): void {
  const caps = document.querySelector<HTMLElement>('.im-caps');
  if (caps === null) return;
  const view = caps.querySelector<HTMLElement>('.im-stage-view');
  const tag = caps.querySelector<HTMLElement>('.im-stage-tag');
  const count = caps.querySelector<HTMLElement>('.im-stage-count');
  const title = caps.querySelector<HTMLElement>('.im-stage-title');
  if (view === null || tag === null || count === null || title === null) return;
  // Without this class (no script), the cards keep their grid.
  caps.classList.add('im-on');

  const items = (): HTMLElement[] =>
    [...caps.querySelectorAll<HTMLElement>('li[data-requires]')].filter((item) => !item.hidden && item.closest('.cap-group[hidden]') === null);
  let active: HTMLElement | null = null;

  const show = (item: HTMLElement, all: readonly HTMLElement[]): void => {
    if (item === active) return;
    active?.classList.remove('is-active');
    active = item;
    item.classList.add('is-active');
    const mini = item.querySelector('.cap-mini');
    view.replaceChildren(...(mini === null ? [] : [copyOf(mini, 'im-stage-mini')]));
    tag.textContent = item.querySelector('.tag')?.textContent ?? '';
    title.textContent = item.querySelector('h4')?.textContent ?? '';
    count.textContent = `${String(all.indexOf(item) + 1).padStart(2, '0')} / ${String(all.length).padStart(2, '0')}`;
  };

  /** The card whose middle is closest to the reading line, measured now (sections above load late). */
  const pick = (): void => {
    if (!desktop.matches) return;
    const all = items();
    const line = window.innerHeight * 0.42;
    let best: HTMLElement | undefined;
    let distance = Infinity;
    for (const item of all) {
      const box = item.getBoundingClientRect();
      const gap = Math.abs(box.top + box.height / 2 - line);
      if (gap < distance) {
        distance = gap;
        best = item;
      }
    }
    if (best !== undefined) show(best, all);
  };

  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      pick();
    });
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  desktop.addEventListener('change', schedule);
  caps.addEventListener('focusin', (event) => {
    const item = (event.target as Element).closest<HTMLElement>('li[data-requires]');
    if (item !== null && desktop.matches) show(item, items());
  });
  pick();
}

export function initImmersive(): void {
  initStage();
  // With "reduce motion" the wall is still mounted, and stays still (see style.css).
  if (!desktop.matches) return;
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
  const start = (): void => void idle(() => mountWall());
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
