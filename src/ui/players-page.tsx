import { useCallback, useEffect, useState } from 'react';
import { DraftApiClient, type PublicDraft, type SessionOwner } from '../api/client';
import type { Player } from '../domain/index';
import { defaultPickTarget, ownerPickTargets, playerDraftability } from './draft-actions';
import { errorMessage } from './errors';
import { ConfirmPickModal, WriteInModal } from './modals';
import { formatSlot } from './view-model';

const api = new DraftApiClient();

export function PlayersPage(props: {
  draft: PublicDraft;
  owner: SessionOwner | null;
  code: string | null;
  onDraftChanged: (draft: PublicDraft) => void;
}) {
  const [search, setSearch] = useState('');
  const [conference, setConference] = useState('');
  const [school, setSchool] = useState('');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState({ conferences: [] as string[], schools: [] as string[] });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const targets = props.owner ? ownerPickTargets(props.draft, props.owner.id) : [];
  const defaultTarget = props.owner ? defaultPickTarget(props.draft, props.owner.id) : undefined;
  const [targetId, setTargetId] = useState(defaultTarget?.id ?? '');
  const [confirmPlayer, setConfirmPlayer] = useState<Player | null>(null);
  const [confirmError, setConfirmError] = useState('');
  const [working, setWorking] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeError, setWriteError] = useState('');

  useEffect(() => {
    const fallback = defaultTarget?.id ?? '';
    if (!targets.some((slot) => slot.id === targetId)) setTargetId(fallback);
  }, [defaultTarget?.id, targetId, targets]);

  useEffect(() => {
    let cancelled = false;
    void api.playerFilterOptions(conference).then((value) => { if (!cancelled) setOptions(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [conference]);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const result = await api.searchPlayers({ search, conference, school, limit: 150 });
      setPlayers(result.players);
      setTotal(result.total);
    } catch (caught) {
      setListError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [search, conference, school]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadPlayers(); }, 150);
    return () => window.clearTimeout(timer);
  }, [loadPlayers]);

  const selectedTarget = targets.find((slot) => slot.id === targetId) ?? defaultTarget;
  const draftedById = new Map(props.draft.slots.filter((slot) => slot.status === 'COMPLETE' && slot.playerId).map((slot) => [slot.playerId as string, slot]));
  const visible = players.filter((player) => {
    if (!availableOnly) return true;
    if (draftedById.has(player.id)) return false;
    if (!props.owner) return true;
    return playerDraftability(props.draft, player, props.owner.id).available;
  });

  async function submitPick() {
    if (!props.code || !confirmPlayer || !selectedTarget) return;
    setWorking(true);
    setConfirmError('');
    try {
      const draft = await api.pick(props.code, selectedTarget.id, confirmPlayer.id);
      props.onDraftChanged(draft);
      setConfirmPlayer(null);
      await loadPlayers();
    } catch (caught) {
      setConfirmError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  async function submitWriteIn(input: { slotId: string; name: string; school: string; conference: string }) {
    if (!props.code) return;
    setWorking(true);
    setWriteError('');
    try {
      const draft = await api.writeIn(props.code, input);
      props.onDraftChanged(draft);
      setWriteOpen(false);
      await loadPlayers();
    } catch (caught) {
      setWriteError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="section-block">
      <div className="section-heading"><div><p className="kicker">Player pool</p><h2>Players</h2></div><span className="badge">{total} matches</span></div>

      {targets.length > 0 && selectedTarget && (
        <div className="pick-action-panel">
          <div><p className="kicker">Your selection</p><strong>{formatSlot(selectedTarget)} · {selectedTarget.status === 'ON_CLOCK' ? 'ON CLOCK' : 'OWED PICK'}</strong></div>
          {targets.length > 1 && <select value={selectedTarget.id} onChange={(event: { target: HTMLSelectElement }) => setTargetId(event.target.value)}>{targets.map((slot) => <option value={slot.id} key={slot.id}>{formatSlot(slot)} · {slot.status === 'ON_CLOCK' ? 'On clock' : 'Owed pick'}</option>)}</select>}
          <button type="button" className="button secondary compact" onClick={() => setWriteOpen(true)}>Write-in</button>
        </div>
      )}
      {props.owner && targets.length === 0 && <p className="browse-note">You can browse the pool now. Draft controls will appear when you are on the clock or owe a pick.</p>}
      {!props.owner && <p className="browse-note">Spectator view. Enter your league code above to enable picks when eligible.</p>}

      <div className="player-tools">
        <input className="search-input" value={search} onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)} placeholder="Search player, school, or conference" aria-label="Search players" />
        <div className="filter-grid">
          <label><span>Conference</span><select value={conference} onChange={(event: { target: HTMLSelectElement }) => { setConference(event.target.value); setSchool(''); }}><option value="">All</option>{options.conferences.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>School</span><select value={school} onChange={(event: { target: HTMLSelectElement }) => setSchool(event.target.value)}><option value="">All</option>{options.schools.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="toggle-row inline-toggle"><input type="checkbox" checked={availableOnly} onChange={(event: { target: HTMLInputElement }) => setAvailableOnly(event.target.checked)} /><span>Available only</span></label>
        </div>
      </div>

      {listError && <p className="form-error inline-error">{listError}</p>}
      {loading ? <p className="empty-state">Loading players…</p> : (
        <div className="player-list">
          {visible.map((player) => {
            const draftedSlot = draftedById.get(player.id);
            const draftedOwner = draftedSlot ? props.draft.owners.find((owner) => owner.id === draftedSlot.ownerId) : undefined;
            const availability = props.owner ? playerDraftability(props.draft, player, props.owner.id) : draftedSlot
              ? { available: false, reason: `Drafted by ${draftedOwner?.name ?? 'another owner'} · ${formatSlot(draftedSlot)}` }
              : { available: true, reason: 'Available' };
            const canDraft = Boolean(props.owner && props.code && selectedTarget && availability.available);
            return (
              <div className={`player-card ${availability.available ? '' : 'is-drafted'}`} key={player.id}>
                <div className="player-main"><strong>{player.name}</strong><span>{player.school} · {player.conference}</span></div>
                <div className="player-card-action"><span className={`availability ${availability.available ? 'available' : 'drafted'}`}>{availability.reason}</span>{canDraft && <button type="button" className="button primary compact" onClick={() => { setConfirmError(''); setConfirmPlayer(player); }}>Draft</button>}</div>
              </div>
            );
          })}
          {!visible.length && <p className="empty-state">No players match those filters.</p>}
        </div>
      )}

      <ConfirmPickModal player={confirmPlayer} slot={selectedTarget ?? null} working={working} error={confirmError} onCancel={() => { if (!working) setConfirmPlayer(null); }} onConfirm={() => void submitPick()} />
      <WriteInModal open={writeOpen} targets={targets} defaultTargetId={selectedTarget?.id ?? ''} working={working} error={writeError} onCancel={() => { if (!working) setWriteOpen(false); }} onSubmit={(input) => void submitWriteIn(input)} />
    </section>
  );
}

