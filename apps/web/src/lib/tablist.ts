/**
 * Wires a WAI-ARIA tablist: click, arrow keys (both axes), Home and End select a tab.
 * Roving tabindex keeps a single tab stop per list.
 */
export function initTablist(list: HTMLElement, onSelect: (tab: HTMLElement) => void): void {
  const tabs = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('[role="tab"]')];

  list.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest<HTMLElement>('[role="tab"]');
    if (tab !== null) onSelect(tab);
  });

  list.addEventListener('keydown', (event) => {
    const all = tabs();
    const index = all.findIndex((tab) => tab === document.activeElement);
    if (index === -1) return;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % all.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + all.length) % all.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    else return;
    event.preventDefault();
    const tab = all[next];
    if (tab === undefined) return;
    tab.focus();
    onSelect(tab);
  });
}

/** Marks `selected` as the active tab of its list. */
export function markSelected(list: HTMLElement, selected: HTMLElement): void {
  for (const tab of list.querySelectorAll<HTMLElement>('[role="tab"]')) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}
