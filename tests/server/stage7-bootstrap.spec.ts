import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationSql = [
  readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0002_player_import_identity.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../../migrations/0003_player_sort_name.sql', import.meta.url), 'utf8'),
].join('\n');

describe('Stage 7 deployment bootstrap', () => {
  it('generates a valid empty-draft bootstrap with 14 owners and 252 snake slots', () => {
    execFileSync(process.execPath, [
      'scripts/generate-bootstrap-sql.mjs',
      '--codes-file=tests/fixtures/stage7-owner-codes.csv',
    ], { cwd: process.cwd(), stdio: 'pipe' });

    const bootstrapSql = readFileSync('.wrangler/bootstrap.sql', 'utf8');
    expect(bootstrapSql).not.toContain('ELBOW59');
    expect(bootstrapSql).toContain('TEST05');
    expect(bootstrapSql).not.toMatch(/\bBEGIN\b/i);
    expect(bootstrapSql).not.toMatch(/\bCOMMIT\b/i);
    expect(bootstrapSql).not.toMatch(/\bSAVEPOINT\b/i);

    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(migrationSql);
    db.exec(bootstrapSql);

    expect((db.prepare('SELECT COUNT(*) AS count FROM owners').get() as { count: number }).count).toBe(14);
    expect((db.prepare('SELECT COUNT(*) AS count FROM draft_slots').get() as { count: number }).count).toBe(252);
    expect((db.prepare('SELECT COUNT(*) AS count FROM owners WHERE is_commissioner = 1').get() as { count: number }).count).toBe(1);

    const first = db.prepare(
      'SELECT o.name FROM draft_slots s JOIN owners o ON o.id = s.owner_id WHERE s.overall_pick = 1',
    ).get() as { name: string };
    const lastRoundOne = db.prepare(
      'SELECT o.name FROM draft_slots s JOIN owners o ON o.id = s.owner_id WHERE s.overall_pick = 14',
    ).get() as { name: string };
    const firstRoundTwo = db.prepare(
      'SELECT o.name FROM draft_slots s JOIN owners o ON o.id = s.owner_id WHERE s.overall_pick = 15',
    ).get() as { name: string };

    expect(first.name).toBe('Chris Barbas');
    expect(lastRoundOne.name).toBe('Werner Gunn');
    expect(firstRoundTwo.name).toBe('Werner Gunn');

    const draft = db.prepare(
      'SELECT rounds, clock_duration_ms, lifecycle FROM drafts WHERE id = ?',
    ).get('active') as { rounds: number; clock_duration_ms: number; lifecycle: string };

    expect(draft).toEqual({
      rounds: 18,
      clock_duration_ms: 24 * 60 * 60 * 1000,
      lifecycle: 'NOT_STARTED',
    });

    db.close();
  });
});
