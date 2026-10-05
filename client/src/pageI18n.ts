// client/src/pageI18n.ts
// DOM side of i18n: fills every [data-i18n] element from the dictionary and
// mounts the fixed 中 / EN toggle. Each page calls initPageI18n() once,
// passing a callback that re-renders its dynamic (JS-built) text.
import { getLang, setLang, t, hasKey } from './i18n.js';

export function applyStaticI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    if (hasKey(key)) el.textContent = t(key);
  });
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
}

export function initPageI18n(onChange?: () => void): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lang-toggle';
  toggle.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
  document.body.appendChild(toggle);

  const render = () => {
    applyStaticI18n();
    toggle.textContent = t('lang.switch');
  };
  render();
  document.addEventListener('langchange', () => {
    render();
    onChange?.();
  });
}
