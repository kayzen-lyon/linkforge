/** English text: playground page. Typed against the French module. */
import type { playground as source } from '../fr/playground.ts';

export const playground: Record<keyof typeof source, string> = {
  'meta.title': 'API playground · Omnillink',
  'meta.description': 'Try every endpoint of the Omnillink API with no key and no sign-up: forms generated from the OpenAPI document, measured timings, code in eight languages, share links, batch processing.',
  'title': 'Playground',
  'lead': 'Try every endpoint, with no key and no sign-up. The forms are generated from the OpenAPI document of this instance: a parameter added to the API shows up here at once.',
  'privacy': 'Nothing is sent before you run a request. The address you entered is then passed to the API, which reads the page.',
  'tips.title': 'What the playground can do',
  'tips.1.title': 'Share link',
  'tips.1.body': 'The state of the form lives in the address. Copy it to find or pass on a request. The API key is never part of it.',
  'tips.2.title': 'Batch and CSV export',
  'tips.2.body': 'Paste several addresses in the Batch tab: a table of results, exportable as CSV.',
  'tips.3.title': 'Screenshot comparison',
  'tips.3.body': 'On `/screenshot`, compare light and dark, or desktop and mobile, side by side.',
  'tips.4.title': 'Collection for your tools',
  'tips.4.body': 'Download the OpenAPI document, or a Postman or Bruno collection generated from it.',
  'dl.openapi': 'OpenAPI document (JSON)',
  'dl.postman': 'Postman collection',
  'dl.bruno': 'Bruno collection',
  'dl.failed': 'The collection could not be generated: the document is unavailable.',
};
