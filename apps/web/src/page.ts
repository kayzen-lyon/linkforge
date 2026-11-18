/** Text pages (accessibility, legal): shared behaviour and language only. */
import './style.css';

import * as en from './i18n/en';
import * as fr from './i18n/fr';
import { createI18n } from './i18n/runtime';
import { parsePath } from './site/config';
import { initShared } from './site/shared';

const section = parsePath(location.pathname).page === 'legal' ? 'legal' : 'a11y';
initShared(
  createI18n<string>({
    fr: { ...fr.common, ...fr[section] },
    en: { ...en.common, ...en[section] },
  }),
);
