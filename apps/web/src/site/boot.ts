/**
 * Source of `/boot.js`, the only render-blocking script: it runs in <head>
 * before first paint so nothing flashes.
 *
 *  - A visitor who chose another language is sent to that language's URL,
 *    unless they are navigating inside the site (then the URL decides).
 *  - The theme (light unless the visitor chose dark, or chose to follow the
 *    system), the accessibility
 *    options and the dismissed banner are applied to <html>.
 *
 * It is served as a file rather than inlined so the site can run under a
 * Content-Security-Policy without 'unsafe-inline'.
 */
import { LOCALES, STORAGE } from './config.ts';

export function bootSource(): string {
  const prefixes = JSON.stringify(Object.fromEntries(LOCALES.map((locale) => [locale.code, locale.prefix])));
  return `(function(){var d=document.documentElement,m=window.matchMedia;
try{var s=localStorage,P=${prefixes},p=location.pathname,cur='${LOCALES[0].code}',bare=p;
for(var c in P){var x=P[c];if(x&&(p===x||p.indexOf(x+'/')===0)){cur=c;bare=p.slice(x.length)||'/'}}
var l=s.getItem('${STORAGE.lang}');
if(l&&l!==cur&&Object.prototype.hasOwnProperty.call(P,l)&&document.referrer.indexOf(location.origin)!==0){location.replace(P[l]+bare+location.search+location.hash);return}
var t=s.getItem('${STORAGE.theme}');
if(t==='system')t=m('(prefers-color-scheme: dark)').matches?'dark':'light';else if(t!=='dark')t='light';
d.setAttribute('data-theme',t);
if(s.getItem('${STORAGE.banner}')==='closed')d.classList.add('no-banner');
var a=JSON.parse(s.getItem('${STORAGE.a11y}')||'null');
if(a){if(a.fontSize)d.style.fontSize=['','112%','125%'][a.fontSize]||'';
var C={highContrast:'high-contrast',legibleFont:'legible-font',oled:'oled',spacing:'wide-spacing',underline:'underline-links',motion:'reduce-motion'};
for(var k in C)if(a[k]===true)d.classList.add(C[k])}
}catch(e){d.setAttribute('data-theme','light')}
})();
`;
}

/**
 * Source of `/sw.js`: an offline fallback and nothing else. It caches the
 * offline page of each language at install and answers a failed page
 * navigation with it. No other request is intercepted, so it can never serve
 * a stale page or asset.
 */
export function serviceWorkerSource(version: string): string {
  const pages = JSON.stringify(Object.fromEntries(LOCALES.map((locale) => [locale.prefix, `${locale.prefix}/offline`])));
  return `var CACHE='omnillink-offline-${version}',PAGES=${pages};
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(Object.keys(PAGES).map(function(k){return PAGES[k]}))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){if(e.request.mode!=='navigate')return;
e.respondWith(fetch(e.request).catch(function(){var p=new URL(e.request.url).pathname,best='';
for(var k in PAGES)if(k&&(p===k||p.indexOf(k+'/')===0))best=k;
return caches.match(PAGES[best]).then(function(r){return r||Response.error()})}))});
`;
}
