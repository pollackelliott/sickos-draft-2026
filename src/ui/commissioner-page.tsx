import { useCallback, useEffect, useMemo, useState } from 'react';
import { DraftApiClient, type PublicDraft } from '../api/client';
import type { DraftSlot, Player } from '../domain/index';
import { ownerPickTargets } from './draft-actions';
import { errorMessage } from './errors';
import { formatSlot } from './view-model';

const api = new DraftApiClient();
const HOUR = 60 * 60 * 1000;

function ownerName(draft: PublicDraft, ownerId: string): string {
  return draft.owners.find((owner) => owner.id === ownerId)?.name ?? ownerId;
}

function slotLabel(draft: PublicDraft, slot: DraftSlot): string {
  return `${formatSlot(slot)} · ${ownerName(draft, slot.ownerId)}`;
}

function availableForSlot(draft: PublicDraft, player: Player, slot: DraftSlot): { available: boolean; reason: string } {
  const draftedElsewhere = draft.slots.find(
    (candidate) => candidate.id !== slot.id && candidate.status === 'COMPLETE' && candidate.playerId === player.id,
  );
  if (draftedElsewhere) {
    return {
      available: false,
      reason: `Drafted by ${ownerName(draft, draftedElsewhere.ownerId)} · ${formatSlot(draftedElsewhere)}`,
    };
  }

  const playersById = new Map(draft.players.map((candidate) => [candidate.id, candidate]));
  const conflict = draft.slots.some((candidate) => {
    if (
      candidate.id === slot.id ||
      candidate.ownerId !== slot.ownerId ||
      candidate.status !== 'COMPLETE' ||
      !candidate.playerId
    ) return false;
    return playersById.get(candidate.playerId)?.conference === player.conference;
  });

  if (conflict) return { available: false, reason: `${player.conference} already used` };
  return { available: true, reason: 'Available' };
}

function PlayerChooser(props: {
  draft: PublicDraft;
  slot: DraftSlot | null;
  actionLabel: string;
  working: boolean;
  onChoose: (player: Player) => void;
}) {
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!search.trim()) {
      setPlayers([]);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.searchPlayers({ search, limit: 40 });
      setPlayers(result.players);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="commissioner-player-search">
      <input
        className="search-input"
        value={search}
        onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)}
        placeholder="Search player name"
        aria-label="Search player for commissioner action"
      />
      {error && <p className="form-error">{error}</p>}
      {loading && <p className="empty-state">Searching…</p>}
      {!loading && search.trim() && players.length === 0 && <p className="empty-state">No matching players.</p>}
      <div className="commissioner-player-results">
        {players.map((player) => {
          const availability = props.slot ? availableForSlot(props.draft, player, props.slot) : { available: false, reason: 'Choose a slot first' };
          return (
            <div className="commissioner-player-row" key={player.id}>
              <div><strong>{player.name}</strong><span>{player.school} · {player.conference}</span></div>
              <div className="commissioner-player-action">
                <span className={availability.available ? 'availability available' : 'availability drafted'}>{availability.reason}</span>
                <button
                  type="button"
                  className="button primary compact"
                  disabled={!availability.available || props.working}
                  onClick={() => props.onChoose(player)}
                >
                  {props.actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CommissionerPage(props: {
  draft: PublicDraft;
  code: string;
  onDraftChanged: (draft: PublicDraft) => void;
}) {
  const actionableSlots = useMemo(
    () => props.draft.owners.flatMap((owner) => ownerPickTargets(props.draft, owner.id)),
    [props.draft],
  );
  const completedSlots = useMemo(
    () => props.draft.slots.filter((slot) => slot.status === 'COMPLETE').sort((a, b) => a.overallPick - b.overallPick),
    [props.draft],
  );

  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [clockHours, setClockHours] = useState(String(props.draft.config.clockDurationMs / HOUR));
  const [proxySlotId, setProxySlotId] = useState(actionableSlots[0]?.id ?? '');
  const [correctionSlotId, setCorrectionSlotId] = useState(completedSlots[0]?.id ?? '');
  const [resetText, setResetText] = useState('');

  useEffect(() => {
    if (!actionableSlots.some((slot) => slot.id === proxySlotId)) setProxySlotId(actionableSlots[0]?.id ?? '');
  }, [actionableSlots, proxySlotId]);

  useEffect(() => {
    if (!completedSlots.some((slot) => slot.id === correctionSlotId)) setCorrectionSlotId(completedSlots[0]?.id ?? '');
  }, [completedSlots, correctionSlotId]);

  useEffect(() => {
    setClockHours(String(props.draft.config.clockDurationMs / HOUR));
  }, [props.draft.config.clockDurationMs]);

  const proxySlot = actionableSlots.find((slot) => slot.id === proxySlotId) ?? null;
  const correctionSlot = completedSlots.find((slot) => slot.id === correctionSlotId) ?? null;

  async function run(action: () => Promise<PublicDraft>, success: string) {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const draft = await action();
      props.onDraftChanged(draft);
      setMessage(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  async function downloadCsv() {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const csv = await api.exportCsv(props.code);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sickos-draft-2026.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('CSV downloaded.');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  const active = props.draft.activeSlotId
    ? props.draft.slots.find((slot) => slot.id === props.draft.activeSlotId) ?? null
    : null;

  return (
    <section className="section-block commissioner-page">
      <div className="section-heading">
        <div><p className="kicker">League administration</p><h2>Commissioner</h2></div>
        <span className="badge">Elliott only</span>
      </div>

      {message && <p className="commissioner-message">{message}</p>}
      {error && <p className="form-error commissioner-error">{error}</p>}

      <div className="commissioner-grid">
        <article className="commissioner-card">
          <p className="kicker">Draft state</p>
          <h3>Controls</h3>
          <div className="commissioner-buttons">
            {props.draft.lifecycle === 'NOT_STARTED' && (
              <button type="button" className="button primary" disabled={working} onClick={() => void run(() => api.startDraft(props.code), 'Draft started.')}>Start draft</button>
            )}
            {props.draft.lifecycle === 'IN_PROGRESS' && !props.draft.paused && (
              <button type="button" className="button secondary" disabled={working} onClick={() => void run(() => api.pauseDraft(props.code), 'Draft paused.')}>Pause</button>
            )}
            {props.draft.lifecycle === 'IN_PROGRESS' && props.draft.paused && (
              <button type="button" className="button primary" disabled={working} onClick={() => void run(() => api.resumeDraft(props.code), 'Draft resumed.')}>Resume</button>
            )}
            {active && !props.draft.paused && (
              <button
                type="button"
                className="button danger"
                disabled={working}
                onClick={() => {
                  if (window.confirm(`Skip ${slotLabel(props.draft, active)} and leave that pick owed?`)) {
                    void run(() => api.skipActive(props.code, active.id), 'Active slot skipped; the owner now owes that pick.');
                  }
                }}
              >
                Skip active pick
              </button>
            )}
          </div>
          <p className="commissioner-detail">
            {active ? `Current: ${slotLabel(props.draft, active)}` : props.draft.lifecycle === 'COMPLETE' ? 'Draft complete.' : 'No active slot.'}
          </p>
        </article>

        <article className="commissioner-card">
          <p className="kicker">Future clocks</p>
          <h3>Clock length</h3>
          <label className="field-label">
            <span>Hours per pick</span>
            <input type="number" min="0.25" step="0.25" value={clockHours} onChange={(event: { target: HTMLInputElement }) => setClockHours(event.target.value)} />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={working || !(Number(clockHours) > 0)}
            onClick={() => void run(() => api.changeClock(props.code, Number(clockHours) * HOUR), 'Future clock length updated.')}
          >
            Update future clocks
          </button>
          <p className="commissioner-detail">The currently running deadline does not change.</p>
        </article>
      </div>

      <article className="commissioner-card commissioner-wide">
        <p className="kicker">Absent owner</p>
        <h3>Make a pick for an owner</h3>
        {actionableSlots.length ? (
          <>
            <label className="field-label">
              <span>Available draft slot</span>
              <select value={proxySlot?.id ?? ''} onChange={(event: { target: HTMLSelectElement }) => setProxySlotId(event.target.value)}>
                {actionableSlots.map((slot) => <option value={slot.id} key={slot.id}>{slotLabel(props.draft, slot)} · {slot.status === 'ON_CLOCK' ? 'On clock' : 'Owed'}</option>)}
              </select>
            </label>
            <PlayerChooser
              draft={props.draft}
              slot={proxySlot}
              actionLabel="Make pick"
              working={working}
              onChoose={(player) => {
                if (!proxySlot) return;
                if (window.confirm(`Draft ${player.name} for ${ownerName(props.draft, proxySlot.ownerId)} at ${formatSlot(proxySlot)}?`)) {
                  void run(
                    () => api.proxyPick(props.code, proxySlot.ownerId, proxySlot.id, player.id),
                    `Pick entered for ${ownerName(props.draft, proxySlot.ownerId)}.`,
                  );
                }
              }}
            />
          </>
        ) : <p className="empty-state">No owner currently has an actionable slot.</p>}
      </article>

      <article className="commissioner-card commissioner-wide">
        <p className="kicker">Mistake repair</p>
        <h3>Correct or remove a completed pick</h3>
        {completedSlots.length ? (
          <>
            <label className="field-label">
              <span>Completed slot</span>
              <select value={correctionSlot?.id ?? ''} onChange={(event: { target: HTMLSelectElement }) => setCorrectionSlotId(event.target.value)}>
                {completedSlots.map((slot) => {
                  const player = props.draft.players.find((candidate) => candidate.id === slot.playerId);
                  return <option value={slot.id} key={slot.id}>{slotLabel(props.draft, slot)} · {player?.name ?? 'Unknown player'}</option>;
                })}
              </select>
            </label>
            <div className="commissioner-correction-actions">
              <button
                type="button"
                className="button danger"
                disabled={working || !correctionSlot}
                onClick={() => {
                  if (!correctionSlot) return;
                  if (window.confirm(`Remove the pick from ${slotLabel(props.draft, correctionSlot)}? The slot will become OWED and later picks will stay unchanged.`)) {
                    void run(() => api.removePick(props.code, correctionSlot.id), 'Pick removed; original slot is now owed.');
                  }
                }}
              >
                Remove pick
              </button>
            </div>
            <p className="commissioner-detail">To replace the selection, choose a valid player below. Later picks and the live clock stay unchanged.</p>
            <PlayerChooser
              draft={props.draft}
              slot={correctionSlot}
              actionLabel="Replace"
              working={working}
              onChoose={(player) => {
                if (!correctionSlot) return;
                if (window.confirm(`Replace ${slotLabel(props.draft, correctionSlot)} with ${player.name}?`)) {
                  void run(() => api.correctPick(props.code, correctionSlot.id, player.id), 'Completed pick corrected.');
                }
              }}
            />
          </>
        ) : <p className="empty-state">No completed picks to correct.</p>}
      </article>

      <div className="commissioner-grid">
        <article className="commissioner-card">
          <p className="kicker">Backup</p>
          <h3>Export</h3>
          <button type="button" className="button secondary" disabled={working} onClick={() => void downloadCsv()}>Download draft CSV</button>
          <p className="commissioner-detail">Exports completed picks in original draft-slot order.</p>
        </article>

        <article className="commissioner-card destructive-card">
          <p className="kicker">Destructive</p>
          <h3>Reset draft</h3>
          <label className="field-label"><span>Type RESET</span><input value={resetText} onChange={(event: { target: HTMLInputElement }) => setResetText(event.target.value)} /></label>
          <button
            type="button"
            className="button danger"
            disabled={working || resetText !== 'RESET'}
            onClick={() => {
              if (window.confirm('Reset the entire draft? All selections and write-ins will be removed.')) {
                void run(() => api.resetDraft(props.code), 'Draft reset to its initial unstarted state.');
                setResetText('');
              }
            }}
          >
            Reset entire draft
          </button>
        </article>
      </div>
    </section>
  );
}
