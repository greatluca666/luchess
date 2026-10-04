import { describe, it, expect } from 'vitest';
import { GAME_TEXT, VARIANT_LABELS } from '../src/i18n.js';

describe('i18n', () => {
  it('uses English variant labels', () => {
    expect(VARIANT_LABELS.chess).toBe('Standard');
    expect(VARIANT_LABELS['3check']).toBe('Three-check');
    expect(VARIANT_LABELS.kingofthehill).toBe('King of the Hill');
  });

  it('uses English UI text for the board actions', () => {
    expect(GAME_TEXT.resign).toBe('Resign');
    expect(GAME_TEXT.draw).toBe('Draw');
    expect(GAME_TEXT.undo).toBe('Undo');
    expect(GAME_TEXT.copied).toBe('Copied!');
  });
});
