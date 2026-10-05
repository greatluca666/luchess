import { describe, it, expect, beforeEach } from 'vitest';
import {
  DICTIONARIES,
  detectLang,
  setLang,
  hasKey,
  variantLabel,
  resultText,
  errorText,
} from '../src/i18n.js';

const ALL_VARIANTS = [
  'chess',
  'chess960',
  '3check',
  'kingofthehill',
  'atomic',
  'antichess',
  'racingkings',
  'horde',
  'crazyhouse',
  'fogofwar',
];

describe('i18n', () => {
  // Start every test from English: the initial language comes from the
  // machine's locale, which may well be Chinese.
  beforeEach(() => setLang('en'));

  it('has exactly the same keys in English and Chinese', () => {
    expect(Object.keys(DICTIONARIES.zh).sort()).toEqual(Object.keys(DICTIONARIES.en).sort());
  });

  it('has no empty strings in either language', () => {
    for (const dict of Object.values(DICTIONARIES)) {
      for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
    }
  });

  it('has a name and a description for every variant', () => {
    for (const id of ALL_VARIANTS) {
      expect(hasKey(`variant.${id}`)).toBe(true);
      expect(hasKey(`variant.${id}.desc`)).toBe(true);
    }
  });

  it('prefers a stored language, then the browser language, then English', () => {
    expect(detectLang('zh', 'en-US')).toBe('zh');
    expect(detectLang('en', 'zh-CN')).toBe('en');
    expect(detectLang(null, 'zh-TW')).toBe('zh');
    expect(detectLang(null, 'en-GB')).toBe('en');
    expect(detectLang('fr', undefined)).toBe('en');
  });

  it('labels variants in the current language and falls back to the raw id', () => {
    expect(variantLabel('kingofthehill')).toBe('King of the Hill');
    setLang('zh');
    expect(variantLabel('fogofwar')).toBe('暗棋');
    expect(variantLabel('not-a-variant')).toBe('not-a-variant');
  });

  it('formats results with a translated reason', () => {
    expect(resultText('1-0', 'checkmate')).toBe('White wins · checkmate');
    setLang('zh');
    expect(resultText('0-1', 'king-captured')).toBe('黑方胜 · 王被吃掉');
    expect(resultText('1/2-1/2', 'some-new-reason')).toBe('和棋 · some-new-reason');
  });

  it('translates known server errors and passes unknown ones through', () => {
    setLang('zh');
    expect(errorText('not your turn')).toBe('还没轮到你');
    expect(errorText('spectators cannot resign')).toBe('观战者不能进行此操作');
    expect(errorText('something unexpected')).toBe('something unexpected');
  });
});
