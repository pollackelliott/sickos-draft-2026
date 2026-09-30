import { describe, expect, it } from 'vitest';
import { PROJECT_NAME, PROJECT_STAGE } from '../src/project';

describe('Stage 0 repository foundation', () => {
  it('identifies the project and deliberately remains at Stage 0', () => {
    expect(PROJECT_NAME).toBe('Sickos Draft 2026');
    expect(PROJECT_STAGE).toContain('Stage 0');
  });
});
