/** Playground page: the full console, plus a Postman collection generated from the live OpenAPI document. */
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

export function startPlayground(i18n: I18n<Key>): void {
  initShared(i18n);
  initConsole(i18n);
  document.getElementById('dl-postman')?.addEventListener('click', () => {
    void loadSpec()
      .then((spec) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(postmanCollection(spec), null, 2)], { type: 'application/json' }));
        const link = h('a', { href: url, download: 'omnillink.postman_collection.json' });
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch(() => toast(i18n.t('dl.failed'), 'error'));
  });
}
