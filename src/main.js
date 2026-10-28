// Ponto de entrada do PWA.
//
// Ordem importa pouco entre os módulos de UI (só registram listeners), mas
// `boot()` precisa rodar depois que `chrome.js` e `events.js` já montaram a
// interface e os handlers delegados — por isso os imports de efeito colateral
// vêm antes.

import './ui/chrome.js';
import './ui/events.js';
import { boot } from './boot.js';

boot();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
