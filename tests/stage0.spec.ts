import { describe, expect, it } from 'vitest';
import { PROJECT_NAME, PROJECT_STAGE } from '../src/project';

describe('repository identity', () => {
  it('identifies the project and current implementation stage', () => {
    expect(PROJECT_NAME).toBe('Sickos Draft 2026');
    expect(PROJECT_STAGE).toBe('Stage 6B — Player imports and refresh');
  });
});
