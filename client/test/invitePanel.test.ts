import { describe, it, expect } from 'vitest';
import { shouldShowInvitePanel } from '../src/invitePanel.js';

describe('shouldShowInvitePanel', () => {
  it('shows the panel while waiting for an opponent', () => {
    expect(shouldShowInvitePanel('waiting')).toBe(true);
  });

  it('hides the panel once the game is playing', () => {
    expect(shouldShowInvitePanel('playing')).toBe(false);
  });

  it('hides the panel once the game is finished', () => {
    expect(shouldShowInvitePanel('finished')).toBe(false);
  });
});
