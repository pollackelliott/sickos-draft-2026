import { describe, expect, it } from 'vitest';
import { demoPlayers, makeDemoDraft } from '../../src/ui/demo-data.js';
import {
  buildBoard,
  conferenceChecklist,
  formatCountdown,
  nextScheduledSlots,
  owedSlots,
  playerRows,
  recentPicks,
  roundPicks,
  rosterForOwner,
} from '../../src/ui/view-model.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 30, 17, 0, 0);

describe('Stage 3 read-only view models', () => {
  it('builds a round-by-owner board while preserving snake slot numbers', () => {
    const state = makeDemoDraft(NOW);
    const board = buildBoard(state, demoPlayers);
    expect(board.length).toBe(6);
    expect(board[0].cells.map((cell) => cell.slot.roundPick)).toEqual([1, 2, 3, 4]);
    expect(board[1].cells.map((cell) => cell.slot.roundPick)).toEqual([4, 3, 2, 1]);
  });

  it('builds a sequential mobile round list in actual pick order', () => {
    const state = makeDemoDraft(NOW);
    expect(roundPicks(state, demoPlayers, 2).map((cell) => cell.slot.id))
      .toEqual(['R2-P1', 'R2-P2', 'R2-P3', 'R2-P4']);
  });

  it('shows an owed slot plus the next active slot after demo expiration', () => {
    const state = makeDemoDraft(NOW);
    expect(owedSlots(state).map((slot) => slot.id)).toEqual(['R1-P4']);
    expect(state.activeSlotId).toBe('R2-P1');
    expect(state.activeDeadlineMs).toBe(NOW + 11 * HOUR);
  });

  it('provides the next three future scheduled picks', () => {
    const state = makeDemoDraft(NOW);
    expect(nextScheduledSlots(state).map((slot) => slot.id)).toEqual(['R2-P2', 'R2-P3', 'R2-P4']);
  });

  it('orders recent picks by actual submission time', () => {
    const state = makeDemoDraft(NOW);
    expect(recentPicks(state, demoPlayers).map((item) => item.slot.id)).toEqual(['R1-P3', 'R1-P2', 'R1-P1']);
  });

  it('filters the player pool and hides drafted players when Available Only is on', () => {
    const state = makeDemoDraft(NOW);
    const rows = playerRows(state, demoPlayers, {
      search: '', conference: 'ACC', school: '', availableOnly: true, sort: 'name',
    });
    expect(rows.map((row) => row.player.id)).toEqual(['acc-3', 'acc-2']);
  });

  it('retains drafted players when Available Only is off and labels them clearly', () => {
    const state = makeDemoDraft(NOW);
    const rows = playerRows(state, demoPlayers, {
      search: 'alex carter', conference: '', school: '', availableOnly: false, sort: 'name',
    });
    expect(rows.length).toBe(1);
    expect(rows[0].available).toBe(false);
    expect(rows[0].statusText).toContain('Drafted by Avery');
  });

  it('builds team rosters and conference checklists without duplicating player names', () => {
    const state = makeDemoDraft(NOW);
    const roster = rosterForOwner(state, demoPlayers, 'avery');
    const checklist = conferenceChecklist(state, demoPlayers, 'avery');
    expect(roster.map((item) => item.player.id)).toEqual(['acc-1']);
    expect(checklist.find((item) => item.conference === 'ACC')?.filled).toBe(true);
    expect(checklist.find((item) => item.conference === 'Big Ten')?.filled).toBe(false);
  });

  it('formats a compact countdown', () => {
    expect(formatCountdown(NOW + 11 * HOUR + 42 * 60_000, NOW)).toBe('11h 42m remaining');
  });
});
