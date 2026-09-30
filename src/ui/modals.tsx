import { useEffect, useState } from 'react';
import { DraftApiClient, type SessionOwner } from '../api/client';
import type { DraftSlot, Player } from '../domain/index';
import { formatSlot } from './view-model';
import { errorMessage } from './errors';

const api = new DraftApiClient();

export function IdentityModal(props: {
  open: boolean;
  onClose: () => void;
  onSuccess: (owner: SessionOwner, code: string) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (props.open) {
      setValue('');
      setError('');
      setWorking(false);
    }
  }, [props.open]);

  if (!props.open) return null;

  async function submit() {
    if (!value.trim()) return;
    setWorking(true);
    setError('');
    try {
      const owner = await api.getMe(value);
      props.onSuccess(owner, value);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="identity-title" onMouseDown={(event: { stopPropagation(): void }) => event.stopPropagation()}>
        <p className="kicker">Owner access</p>
        <h2 id="identity-title">Enter league code</h2>
        <p className="modal-copy">Your code identifies your team and enables picks when you are eligible to draft.</p>
        <input
          className="code-input"
          autoCapitalize="characters"
          autoComplete="off"
          value={value}
          onChange={(event: { target: HTMLInputElement }) => setValue(event.target.value)}
          onKeyDown={(event: { key: string }) => { if (event.key === 'Enter') void submit(); }}
          placeholder="BLUE42"
          aria-label="League code"
        />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={props.onClose}>Cancel</button>
          <button type="button" className="button primary" disabled={working || !value.trim()} onClick={() => void submit()}>
            {working ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ConfirmPickModal(props: {
  player: Player | null;
  slot: DraftSlot | null;
  working: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.player || !props.slot) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event: { stopPropagation(): void }) => event.stopPropagation()}>
        <p className="kicker">Confirm selection</p>
        <h2 id="confirm-title">Draft {props.player.name}?</h2>
        <div className="confirm-player">
          <strong>{props.player.name}</strong>
          <span>{props.player.school}</span>
          <em>{props.player.conference}</em>
        </div>
        <p className="modal-copy">This will fill <strong>{formatSlot(props.slot)}</strong>{props.slot.status === 'OWED' ? ' as an owed-pick backfill' : ''}.</p>
        {props.error && <p className="form-error">{props.error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={props.working} onClick={props.onCancel}>Cancel</button>
          <button type="button" className="button primary" disabled={props.working} onClick={props.onConfirm}>
            {props.working ? 'Submitting…' : 'Draft player'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WriteInModal(props: {
  open: boolean;
  targets: DraftSlot[];
  defaultTargetId: string;
  working: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (input: { slotId: string; name: string; school: string; conference: string }) => void;
}) {
  const [slotId, setSlotId] = useState(props.defaultTargetId);
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [conference, setConference] = useState('');

  useEffect(() => {
    if (props.open) {
      setSlotId(props.defaultTargetId);
      setName('');
      setSchool('');
      setConference('');
    }
  }, [props.open, props.defaultTargetId]);

  if (!props.open) return null;
  const valid = Boolean(slotId && name.trim() && school.trim() && conference.trim());

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="write-title" onMouseDown={(event: { stopPropagation(): void }) => event.stopPropagation()}>
        <p className="kicker">Missing player</p>
        <h2 id="write-title">Write-in player</h2>
        {props.targets.length > 1 && (
          <label className="field-label"><span>Draft slot</span><select value={slotId} onChange={(event: { target: HTMLSelectElement }) => setSlotId(event.target.value)}>
            {props.targets.map((slot) => <option key={slot.id} value={slot.id}>{formatSlot(slot)} · {slot.status === 'ON_CLOCK' ? 'On clock' : 'Owed pick'}</option>)}
          </select></label>
        )}
        <label className="field-label"><span>Player name</span><input value={name} onChange={(event: { target: HTMLInputElement }) => setName(event.target.value)} /></label>
        <label className="field-label"><span>School</span><input value={school} onChange={(event: { target: HTMLInputElement }) => setSchool(event.target.value)} /></label>
        <label className="field-label"><span>Conference</span><input value={conference} onChange={(event: { target: HTMLInputElement }) => setConference(event.target.value)} /></label>
        <p className="modal-copy">If Name + School already exists in the pool, the app will require you to use that existing player instead.</p>
        {props.error && <p className="form-error">{props.error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={props.working} onClick={props.onCancel}>Cancel</button>
          <button type="button" className="button primary" disabled={props.working || !valid} onClick={() => props.onSubmit({ slotId, name: name.trim(), school: school.trim(), conference: conference.trim() })}>
            {props.working ? 'Submitting…' : 'Draft write-in'}
          </button>
        </div>
      </section>
    </div>
  );
}

