import { useEffect, useMemo, useState } from 'react';
import type { PublicDraft, SessionOwner } from '../api/client';
import { ownerPickTargets } from './draft-actions';
import { buildBoard, formatCountdown, formatDeadline, formatSlot, nextScheduledSlots, owedSlots, recentPicks, roundPicks } from './view-model';
import { useNow } from './use-now';

export function DraftPage(props: { draft: PublicDraft; owner: SessionOwner | null; onGoPlayers: () => void }) {
  const { draft } = props;
  const now = useNow();
  const board = useMemo(() => buildBoard(draft, draft.players), [draft]);
  const upcoming = nextScheduledSlots(draft);
  const outstanding = owedSlots(draft);
  const recent = recentPicks(draft, draft.players);
  const owners = new Map(draft.owners.map((owner) => [owner.id, owner]));
  const active = draft.activeSlotId ? draft.slots.find((slot) => slot.id === draft.activeSlotId) : undefined;
  const activeOwner = active ? owners.get(active.ownerId) : undefined;
  const liveRound = active?.round ?? (draft.lifecycle === 'COMPLETE' ? draft.config.rounds : 1);
  const [selectedRound, setSelectedRound] = useState(liveRound);
  const [mobileFullBoard, setMobileFullBoard] = useState(false);
  const selectedRoundPicks = useMemo(
    () => roundPicks(draft, draft.players, selectedRound),
    [draft, selectedRound],
  );
  const targets = props.owner ? ownerPickTargets(draft, props.owner.id) : [];

  useEffect(() => {
    setSelectedRound(liveRound);
  }, [liveRound]);

  return (
    <>
      <section className="clock-panel" aria-label="Current draft status">
        <div>
          <p className="kicker">{draft.paused ? 'Draft paused' : 'On the clock'}</p>
          <h2>{draft.paused ? 'Clock frozen' : activeOwner?.name ?? (draft.lifecycle === 'NOT_STARTED' ? 'Not started' : 'Draft complete')}</h2>
          <p className="clock-big">{draft.paused ? 'Paused' : formatCountdown(draft.activeDeadlineMs, now)}</p>
          <p className="clock-deadline">Deadline: {formatDeadline(draft.activeDeadlineMs)}</p>
        </div>
        <div className="next-picks">
          <span className="mini-label">Up next</span>
          {upcoming.length ? upcoming.map((slot) => <span key={slot.id}>{formatSlot(slot)} {owners.get(slot.ownerId)?.name}</span>) : <span>—</span>}
        </div>
      </section>

      {targets.length > 0 && (
        <section className="your-turn-strip">
          <div><strong>Your pick is available.</strong><span>{targets.map((slot) => `${formatSlot(slot)} ${slot.status === 'ON_CLOCK' ? 'on clock' : 'owed'}`).join(' · ')}</span></div>
          <button type="button" className="button primary" onClick={props.onGoPlayers}>Choose player</button>
        </section>
      )}

      {outstanding.length > 0 && (
        <section className="owed-strip" aria-label="Outstanding picks">
          <strong>Outstanding:</strong>
          {outstanding.map((slot) => <span key={slot.id}>{owners.get(slot.ownerId)?.name} {formatSlot(slot)}</span>)}
        </section>
      )}

      <section className="section-block">
        <div className="section-heading"><div><p className="kicker">Overall board</p><h2>Draft</h2></div><span className="badge">{draft.config.rounds} rounds</span></div>

        <div className="mobile-board-controls" aria-label="Mobile draft board controls">
          {!mobileFullBoard ? (
            <div className="round-stepper">
              <button type="button" className="round-step-button" aria-label="Previous round" disabled={selectedRound <= 1} onClick={() => setSelectedRound((round) => Math.max(1, round - 1))}>←</button>
              <div className="round-step-label"><span>Round</span><strong>{selectedRound} <small>of {draft.config.rounds}</small></strong></div>
              <button type="button" className="round-step-button" aria-label="Next round" disabled={selectedRound >= draft.config.rounds} onClick={() => setSelectedRound((round) => Math.min(draft.config.rounds, round + 1))}>→</button>
            </div>
          ) : (
            <div className="round-step-label"><span>View</span><strong>Full board</strong></div>
          )}
          <button type="button" className="button secondary compact" onClick={() => setMobileFullBoard((visible) => !visible)}>
            {mobileFullBoard ? 'Round view' : 'Full board'}
          </button>
        </div>

        <div className={mobileFullBoard ? 'mobile-round-view is-hidden' : 'mobile-round-view'} aria-label={`Round ${selectedRound} picks`}>
          {selectedRoundPicks.map(({ owner, slot, player }) => (
            <div key={slot.id} className={`mobile-pick-row pick-${slot.status.toLowerCase()}`}>
              <div className="mobile-pick-number"><strong>#{slot.overallPick}</strong><span>{formatSlot(slot)}</span></div>
              <div className="mobile-pick-main">
                <span className="mobile-pick-owner">{owner.name}</span>
                {player ? (
                  <>
                    <strong>{player.name}</strong>
                    <span>{player.school} · {player.conference}</span>
                  </>
                ) : (
                  <span className="mobile-pick-empty">{slot.status === 'FUTURE' ? '—' : slot.status === 'OWED' ? 'Owed pick' : 'Waiting for pick'}</span>
                )}
              </div>
              {slot.status === 'ON_CLOCK' && <strong className="mobile-pick-state">ON CLOCK</strong>}
              {slot.status === 'OWED' && <strong className="mobile-pick-state owed">OWED</strong>}
              {slot.selectionKind === 'BACKFILL' && <strong className="mobile-pick-state">BACKFILL</strong>}
            </div>
          ))}
        </div>

        <div className={mobileFullBoard ? 'board-wrap desktop-board mobile-board-visible' : 'board-wrap desktop-board'} aria-label="Draft board">
          <table className="draft-board">
            <thead><tr><th className="round-head">Round</th>{draft.owners.map((owner) => <th key={owner.id}>{owner.name}</th>)}</tr></thead>
            <tbody>
              {board.map((row) => (
                <tr key={row.round}>
                  <th className="round-cell">{row.round}</th>
                  {row.cells.map(({ slot, player }) => (
                    <td key={slot.id} className={`pick-cell pick-${slot.status.toLowerCase()}`}>
                      <span className="pick-number">{formatSlot(slot)} · #{slot.overallPick}</span>
                      {player ? <><strong>{player.name}</strong><span>{player.school}</span><em>{player.conference}</em></>
                        : slot.status === 'OWED' ? <strong className="state-label">OWED PICK</strong>
                        : slot.status === 'ON_CLOCK' ? <strong className="state-label">ON CLOCK</strong>
                        : <span className="future-label">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-block recent-section">
        <div className="section-heading"><div><p className="kicker">Latest activity</p><h2>Recent picks</h2></div></div>
        <div className="recent-list">
          {recent.length === 0 && <p className="empty-state">No picks yet.</p>}
          {recent.map(({ slot, owner, player }) => (
            <div className="recent-row" key={slot.id}><span className="recent-pick">{formatSlot(slot)}</span><div><strong>{owner?.name}</strong><span>{player?.name} · {player?.school} · {player?.conference}</span></div>{slot.selectionKind === 'BACKFILL' && <em>Backfill</em>}</div>
          ))}
        </div>
      </section>
    </>
  );
}
