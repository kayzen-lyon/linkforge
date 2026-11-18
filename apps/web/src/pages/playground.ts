/** Playground page: the full console, plus Postman and Bruno collections generated from the live OpenAPI document. */
import { initConsole } from '../console/index';
import { loadSpec, shortName, type ApiSpec } from '../console/spec';
import type { common } from '../i18n/fr/common';
import type { consoleText } from '../i18n/fr/console';
import type { playground } from '../i18n/fr/playground';
import type { I18n } from '../i18n/runtime';
import { h } from '../lib/dom';
import { initShared, toast } from '../site/shared';

type Key = keyof typeof common | keyof typeof playground | keyof typeof consoleText;

/** A Postman v2.1 collection: one request per operation, the instance origin as a variable. */
function postmanCollection(spec: ApiSpec): unknown {
  return {
    info: {
      name: `${spec.title} ${spec.version}`.trim(),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [{ key: 'baseUrl', value: location.origin }],
    item: spec.operations.map((operation) => {
      const query = operation.params.filter((item) => item.where === 'query');
      const body = operation.params.filter((item) => item.where === 'body');
      return {
        name: `${operation.method} ${shortName(operation)}`,
        request: {
          method: operation.method,
          description: operation.summary,
          header: operation.method === 'POST' ? [{ key: 'content-type', value: 'application/json' }] : [],
          url: {
            raw: `{{baseUrl}}${operation.path}`,
            host: ['{{baseUrl}}'],
            path: operation.path.split('/').filter(Boolean),
            query: query.map((item) => ({ key: item.name, value: item.fallback ?? '', description: item.description, disabled: !item.required })),
          },
          ...(body.length === 0
            ? {}
            : { body: { mode: 'raw', raw: JSON.stringify(Object.fromEntries(body.map((item) => [item.name, item.type === 'array' ? [] : (item.fallback ?? '')])), null, 2) } }),
        },
      };
    }),
  };
}

/**
 * A Bruno collection in its JSON export format (Bruno: Import collection >
 * Bruno Collection): one request per operation, the origin in an environment.
 */
function brunoCollection(spec: ApiSpec): unknown {
  return {
    name: `${spec.title} ${spec.version}`.trim(),
    version: '1',
    items: spec.operations.map((operation, at) => {
      const query = operation.params.filter((item) => item.where === 'query');
      const body = operation.params.filter((item) => item.where === 'body');
      const json = JSON.stringify(Object.fromEntries(body.map((item) => [item.name, item.type === 'array' ? [] : (item.fallback ?? '')])), null, 2);
      return {
        type: 'http',
        name: `${operation.method} ${shortName(operation)}`,
        seq: at + 1,
        request: {
          url: `{{baseUrl}}${operation.path}`,
          method: operation.method,
          headers: operation.method === 'POST' ? [{ name: 'content-type', value: 'application/json', enabled: true }] : [],
          params: query.map((item) => ({ name: item.name, value: item.fallback ?? '', type: 'query', enabled: item.required })),
          body: body.length === 0 ? { mode: 'none' } : { mode: 'json', json },
          auth: { mode: 'none' },
          docs: operation.summary,
        },
      };
    }),
    environments: [{ name: 'Omnillink', variables: [{ name: 'baseUrl', value: location.origin, type: 'text', enabled: true, secret: false }] }],
  };
}

export function startPlayground(i18n: I18n<Key>): void {
  initShared(i18n);
  initConsole(i18n);
  const download = (button: string, file: string, build: (spec: ApiSpec) => unknown): void => {
    document.getElementById(button)?.addEventListener('click', () => {
      void loadSpec()
        .then((spec) => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(build(spec), null, 2)], { type: 'application/json' }));
          const link = h('a', { href: url, download: file });
          document.body.append(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        })
        .catch(() => toast(i18n.t('dl.failed'), 'error'));
    });
  };
  download('dl-postman', 'omnillink.postman_collection.json', postmanCollection);
  download('dl-bruno', 'omnillink.bruno_collection.json', brunoCollection);
}
