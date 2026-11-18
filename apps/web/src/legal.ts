/** Legal notice and privacy page: the only script that loads the legal dictionary. */
import './style.css';

import { common as enCommon } from './i18n/en';
import { common as frCommon } from './i18n/fr';
import * as legal from './i18n/legal';
import { createI18n } from './i18n/runtime';
import { initShared } from './site/shared';

initShared(
  createI18n<keyof typeof frCommon | keyof typeof legal.fr>({
    fr: { ...frCommon, ...legal.fr },
    en: { ...enCommon, ...legal.en },
  }),
);
