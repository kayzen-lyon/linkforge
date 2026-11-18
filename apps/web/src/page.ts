/** Accessibility page: shared behaviour and language only. */
import './style.css';

import * as en from './i18n/en';
import * as fr from './i18n/fr';
import { createI18n } from './i18n/runtime';
import { initShared } from './site/shared';

initShared(
  createI18n<keyof typeof fr.common | keyof typeof fr.a11y>({
    fr: { ...fr.common, ...fr.a11y },
    en: { ...en.common, ...en.a11y },
  }),
);
