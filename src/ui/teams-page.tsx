import { useEffect, useState } from 'react';
import type { PublicDraft } from '../api/client';
import { conferenceChecklist, rosterForOwner } from './view-model';

export function TeamsPage(props: { draft: PublicDraft }) {
  const [ownerId, setOwnerId] = useState(props.draft.owners[0]?.id ?? '');
  useEffect(() => { if (!props.draft.owners.some((owner) => owner.id === ownerId)) setOwnerId(props.draft.owners[0]?.id ?? ''); }, [ownerId, props.draft.owners]);
  const roster = rosterForOwner(props.draft, props.draft.players, ownerId);
  const checklist = conferenceChecklist(props.draft, props.draft.players, ownerId);
  const owner = props.draft.owners.find((candidate) => candidate.id === ownerId);
  return (
    <section className="section-block">
      <div className="section-heading"><div><p className="kicker">Fantasy rosters</p><h2>Teams</h2></div></div>
      <div className="team-selector" role="group" aria-label="Choose team">{props.draft.owners.map((candidate) => <button type="button" key={candidate.id} className={candidate.id === ownerId ? 'team-chip active' : 'team-chip'} onClick={() => setOwnerId(candidate.id)}>{candidate.name}</button>)}</div>
      <div className="team-layout"><div><div className="subheading"><h3>{owner?.name}</h3><span>{roster.length} drafted</span></div><div className="roster-list">{roster.length === 0 && <p className="empty-state">No completed picks yet.</p>}{roster.map(({ slot, player }) => <div className="roster-row" key={slot.id}><span className="roster-round">R{slot.round}</span><div><strong>{player.name}</strong><span>{player.school}</span></div><em>{player.conference}</em></div>)}</div></div><aside className="conference-card"><p className="kicker">Conference slots</p><div className="conference-grid">{checklist.map((item) => <div key={item.conference} className={item.filled ? 'conference-item filled' : 'conference-item'}><span>{item.conference}</span><strong>{item.filled ? '✓' : '—'}</strong></div>)}</div></aside></div>
    </section>
  );
}

