/**
 * Aperçu immersif : comportement côté navigateur.
 *  - le mur du premier écran, assemblé au repos à partir des miniatures de réponses déjà
 *    présentes dans la page (aucune image ni requête de plus) ;
 *  - la scène fixe des capacités, qui montre la réponse de la carte en cours de lecture.
 * Le défilement reste natif : on ne fait que lire la position, jamais l'intercepter.
 */
const desktop = window.matchMedia('(min-width: 1024px)');

function node(cls: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = cls;
  return element;
}

/** Copie d'une miniature, sans rien qui puisse recevoir le focus ou se charger en différé. */
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
  // Laisse le navigateur peindre l'état transparent avant de faire apparaître le mur.
  requestAnimationFrame(() => requestAnimationFrame(() => wall.classList.add('is-ready')));

  // Hors de l'écran, le mur ne bouge plus.
  new IntersectionObserver((entries) => {
    for (const entry of entries) wall.classList.toggle('is-paused', !entry.isIntersecting);
  }).observe(wall);
}

function initStage(): void {
  const caps = document.querySelector<HTMLElement>('.im-caps');
  const view = caps?.querySelector<HTMLElement>('.im-stage-view');
  const tag = caps?.querySelector<HTMLElement>('.im-stage-tag');
  const count = caps?.querySelector<HTMLElement>('.im-stage-count');
  const title = caps?.querySelector<HTMLElement>('.im-stage-title');
  if (caps === null || caps === undefined || view == null || tag == null || count == null || title == null) return;
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

  /** La carte dont le milieu est le plus proche de la ligne de lecture, mesurée à l'instant. */
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

initStage();
// « Réduire les animations » : le mur est monté quand même, immobile (voir immersive.css).
if (desktop.matches) {
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
  const start = (): void => void idle(() => mountWall());
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
