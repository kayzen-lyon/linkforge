/**
 * Status page: asks `/health` (and the OpenAPI document for the version) from
 * the visitor's browser, now. It shows what the instance answers and what
 * this request measured — no history, no uptime figure.
 */
import { loadSpec } from '../console/spec';
import type { common } from '../i18n/fr/common';
import type { status } from '../i18n/fr/status';
import type { I18n } from '../i18n/runtime';
import { byId, h, renderCode } from '../lib/dom';
import { initShared } from '../site/shared';

type Key = keyof typeof common | keyof typeof status;
type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

interface Reading {
  readonly ok: boolean;
  readonly at: Date;
  readonly ms: number;
  readonly health: Json | null;
  readonly version: string | null;
  readonly endpoints: number | null;
}

export function startStatus(i18n: I18n<Key>): void {
  initShared(i18n);
  const t = i18n.t;
  const card = byId('status-card');
  const state = byId('status-state');
  let reading: Reading | null = null;

  function duration(seconds: number): string {
    if (seconds >= 86_400) return `${t('u.d', { n: Math.floor(seconds / 86_400) })} ${t('u.h', { n: Math.floor((seconds % 86_400) / 3600) })}`;
    if (seconds >= 3600) return `${t('u.h', { n: Math.floor(seconds / 3600) })} ${t('u.m', { n: Math.floor((seconds % 3600) / 60) })}`;
    if (seconds >= 60) return `${t('u.m', { n: Math.floor(seconds / 60) })} ${t('u.s', { n: seconds % 60 })}`;
    return t('u.s', { n: seconds });
  }

  function render(): void {
    const facts: Array<readonly [Key, string]> = [];
    if (reading === null) {
      state.dataset['state'] = 'checking';
      byId('status-text').textContent = t('checking');
    } else {
      state.dataset['state'] = reading.ok ? 'up' : 'down';
      byId('status-text').textContent = t(reading.ok ? 'up' : 'down');
      const time = new Intl.DateTimeFormat(i18n.lang() === 'fr' ? 'fr-FR' : 'en-GB', { timeStyle: 'medium' }).format(reading.at);
      byId('status-time').textContent = t('measured', { time });
      facts.push(['f.latency', `${Math.round(reading.ms)} ms`]);
      const { health } = reading;
      if (health !== null) {
        if (typeof health['uptimeSeconds'] === 'number') facts.push(['f.uptime', duration(health['uptimeSeconds'])]);
        if (health['cache'] === 'memory' || health['cache'] === 'redis') facts.push(['f.cache', t(`f.cache.${health['cache']}`)]);
        const pool = isRecord(health['browserPool']) ? health['browserPool'] : null;
        if (pool !== null) {
          if (typeof pool['browserConnected'] === 'boolean') facts.push(['f.browser', t(pool['browserConnected'] ? 'f.browser.on' : 'f.browser.off')]);
          if (typeof pool['active'] === 'number') facts.push(['f.active', String(pool['active'])]);
          if (typeof pool['queued'] === 'number') facts.push(['f.queued', String(pool['queued'])]);
          if (typeof pool['maxConcurrency'] === 'number') facts.push(['f.concurrency', String(pool['maxConcurrency'])]);
        }
      }
      if (reading.version !== null) facts.push(['f.version', reading.version]);
      if (reading.endpoints !== null) facts.push(['f.endpoints', String(reading.endpoints)]);
      if (!reading.ok) facts.length = 0;
    }
    const nodes: Node[] = facts.map(([key, value]) => h('div', {}, h('dt', {}, t(key)), h('dd', {}, value)));
    if (reading !== null && !reading.ok) {
      const explain = h('p', { class: 'hint' });
      i18n.render(explain, 'down.body');
      nodes.push(explain);
    }
    byId('status-facts').replaceChildren(...nodes);
  }

  async function check(): Promise<void> {
    card.setAttribute('aria-busy', 'true');
    reading = null;
    render();
    const started = performance.now();
    const at = new Date();
    try {
      const response = await fetch('/health', { cache: 'no-store', headers: { accept: 'application/json' } });
      const ms = performance.now() - started;
      const body: unknown = await response.json();
      const spec = await loadSpec().catch(() => null);
      reading = { ok: response.ok, at, ms, health: isRecord(body) ? body : null, version: spec?.version ?? null, endpoints: spec?.operations.length ?? null };
      renderCode(byId('status-raw'), JSON.stringify(body, null, 2), 'json');
    } catch {
      reading = { ok: false, at, ms: performance.now() - started, health: null, version: null, endpoints: null };
      byId('status-raw').textContent = '–';
    }
    card.setAttribute('aria-busy', 'false');
    render();
  }

  byId('status-refresh').addEventListener('click', () => void check());
  i18n.onChange(render);
  void check();
}
