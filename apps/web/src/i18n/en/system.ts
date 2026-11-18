/** English text: 404 and offline pages. Typed against the French module. */
import type { system as source } from '../fr/system.ts';

export const system: Record<keyof typeof source, string> = {
  'nf.meta.title': 'Page not found · Omnillink',
  'nf.meta.description': 'This address does not match any page of the Omnillink site.',
  'nf.title': 'This page does not exist',
  'nf.lead': 'The address may be incomplete, or the page may have moved. Here is where to go.',
  'nf.search': 'Search the site',
  'nf.home': 'Home',
  'nf.playground': 'Playground',
  'nf.docs': 'API reference',
  'nf.quickstart': 'Five-minute quick start',
  'nf.status': 'Service status',
  'nf.api': 'Were you looking for an API endpoint? They all start with `/api/v1/`.',
  'off.meta.title': 'Offline · Omnillink',
  'off.meta.description': 'You are offline: this page of the Omnillink site could not be loaded.',
  'off.title': 'You are offline',
  'off.lead': 'This page could not be loaded. Check your connection, then try again.',
  'off.retry': 'Try again',
  'guides.title': 'Guides',
};
