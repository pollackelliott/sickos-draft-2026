import { useMemo, useState } from 'react';
import { PROJECT_NAME } from './project';
import { demoPlayers, makeDemoDraft } from './ui/demo-data';
import {
  buildBoard,
  conferenceChecklist,
  formatCountdown,
  formatDeadline,
  formatSlot,
  nextScheduledSlots,
  owedSlots,
  playerRows,
  recentPicks,
  rosterForOwner,
  type PlayerSort,
} from './ui/view-model';
import { useNow } from './ui/use-now';

type Page = 'Draft' | 'Players' | 'Teams' | 'Rules';

const pages: Page[] = ['Draft', 'Players', 'Teams', 'Rules'];

function DraftPage() {
  const [state] = useState(() => makeDemoDraft(Date.now()));
  const now = useNow();
  const board = useMemo(() => buildBoard(state, demoPlayers), [state]);
  const upcoming = nextScheduledSlots(state);
  const outstanding = owedSlots(state);
  const recent = recentPicks(state, demoPlayers);
  const owners = new Map(state.owners.map((owner) => [owner.id, owner]));
  const active = state.activeSlotId ? state.slots.find((slot) => slot.id === state.activeSlotId) : undefined;
  const activeOwner = active ? owners.get(active.ownerId) : undefined;

  return (
    <>
      <section className="clock-panel" aria-label="Current draft status">
        <div>
          <p className="kicker">On the clock</p>
          <h2>{activeOwner?.name ?? 'Draft complete'}</h2>
          <p className="clock-big">{formatCountdown(state.activeDeadlineMs, now)}</p>
          <p className="clock-deadline">Deadline: {formatDeadline(state.activeDeadlineMs)}</p>
        </div>
        <div className="next-picks">
          <span className="mini-label">Up next</span>
          {upcoming.map((slot) => (
            <span key={slot.id}>{formatSlot(slot)} {owners.get(slot.ownerId)?.name}</span>
          ))}
        </div>
      </section>

      {outstanding.length > 0 && (
        <section className="owed-strip" aria-label="Outstanding picks">
          <strong>Outstanding:</strong>
          {outstanding.map((slot) => (
            <span key={slot.id}>{owners.get(slot.ownerId)?.name} {formatSlot(slot)}</span>
          ))}
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="kicker">Overall board</p>
            <h2>Draft</h2>
          </div>
          <span className="badge">Demo data</span>
        </div>
        <div className="board-wrap" aria-label="Draft board">
          <table className="draft-board">
            <thead>
              <tr>
                <th className="round-head">Round</th>
                {state.owners.map((owner) => <th key={owner.id}>{owner.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {board.map((row) => (
                <tr key={row.round}>
                  <th className="round-cell">{row.round}</th>
                  {row.cells.map(({ slot, player }) => (
                    <td key={slot.id} className={`pick-cell pick-${slot.status.toLowerCase()}`}>
                      <span className="pick-number">{formatSlot(slot)} · #{slot.overallPick}</span>
                      {player ? (
                        <>
                          <strong>{player.name}</strong>
                          <span>{player.school}</span>
                          <em>{player.conference}</em>
                        </>
                      ) : slot.status === 'OWED' ? (
                        <strong className="state-label">OWED PICK</strong>
                      ) : slot.status === 'ON_CLOCK' ? (
                        <strong className="state-label">ON CLOCK</strong>
                      ) : (
                        <span className="future-label">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section-block recent-section">
        <div className="section-heading">
          <div>
            <p className="kicker">Latest activity</p>
            <h2>Recent picks</h2>
          </div>
        </div>
        <div className="recent-list">
          {recent.map(({ slot, owner, player }) => (
            <div className="recent-row" key={slot.id}>
              <span className="recent-pick">{formatSlot(slot)}</span>
              <div>
                <strong>{owner?.name}</strong>
                <span>{player?.name} · {player?.school} · {player?.conference}</span>
              </div>
              {slot.selectionKind === 'BACKFILL' && <em>Backfill</em>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function PlayersPage() {
  const [state] = useState(() => makeDemoDraft(Date.now()));
  const [search, setSearch] = useState('');
  const [conference, setConference] = useState('');
  const [school, setSchool] = useState('');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [sort, setSort] = useState<PlayerSort>('name');

  const conferences = [...new Set(demoPlayers.map((player) => player.conference))].sort();
  const schools = [...new Set(
    demoPlayers
      .filter((player) => !conference || player.conference === conference)
      .map((player) => player.school),
  )].sort();

  const rows = playerRows(state, demoPlayers, { search, conference, school, availableOnly, sort });

  return (
    <section className="section-block">
      <div className="section-heading">
        <div><p className="kicker">Player pool</p><h2>Players</h2></div>
        <span className="badge">{rows.length} shown</span>
      </div>

      <div className="player-tools">
        <input
          className="search-input"
          value={search}
          onChange={(event: { target: HTMLInputElement }) => setSearch(event.target.value)}
          placeholder="Search player, school, or conference"
          aria-label="Search players"
        />
        <div className="filter-grid">
          <label>
            <span>Conference</span>
            <select value={conference} onChange={(event: { target: HTMLSelectElement }) => { setConference(event.target.value); setSchool(''); }}>
              <option value="">All</option>
              {conferences.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>School</span>
            <select value={school} onChange={(event: { target: HTMLSelectElement }) => setSchool(event.target.value)}>
              <option value="">All</option>
              {schools.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event: { target: HTMLSelectElement }) => setSort(event.target.value as PlayerSort)}>
              <option value="name">Name</option>
              <option value="school">School</option>
              <option value="conference">Conference</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={availableOnly} onChange={(event: { target: HTMLInputElement }) => setAvailableOnly(event.target.checked)} />
          <span>Available only</span>
        </label>
      </div>

      <div className="player-list">
        {rows.map((row) => (
          <div className={`player-card ${row.available ? '' : 'is-drafted'}`} key={row.player.id}>
            <div className="player-main">
              <strong>{row.player.name}</strong>
              <span>{row.player.school} · {row.player.conference}</span>
            </div>
            <span className={`availability ${row.available ? 'available' : 'drafted'}`}>{row.statusText}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamsPage() {
  const [state] = useState(() => makeDemoDraft(Date.now()));
  const [ownerId, setOwnerId] = useState(state.owners[0]?.id ?? '');
  const roster = rosterForOwner(state, demoPlayers, ownerId);
  const checklist = conferenceChecklist(state, demoPlayers, ownerId);
  const owner = state.owners.find((candidate) => candidate.id === ownerId);

  return (
    <section className="section-block">
      <div className="section-heading">
        <div><p className="kicker">Fantasy rosters</p><h2>Teams</h2></div>
      </div>

      <div className="team-selector" role="group" aria-label="Choose team">
        {state.owners.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={candidate.id === ownerId ? 'team-chip active' : 'team-chip'}
            onClick={() => setOwnerId(candidate.id)}
          >
            {candidate.name}
          </button>
        ))}
      </div>

      <div className="team-layout">
        <div>
          <div className="subheading"><h3>{owner?.name}</h3><span>{roster.length} drafted</span></div>
          <div className="roster-list">
            {roster.length === 0 && <p className="empty-state">No completed picks yet.</p>}
            {roster.map(({ slot, player }) => (
              <div className="roster-row" key={slot.id}>
                <span className="roster-round">R{slot.round}</span>
                <div><strong>{player.name}</strong><span>{player.school}</span></div>
                <em>{player.conference}</em>
              </div>
            ))}
          </div>
        </div>
        <aside className="conference-card">
          <p className="kicker">Conference slots</p>
          <div className="conference-grid">
            {checklist.map((item) => (
              <div key={item.conference} className={item.filled ? 'conference-item filled' : 'conference-item'}>
                <span>{item.conference}</span><strong>{item.filled ? '✓' : '—'}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function RulesPage() {
  return (
    <section className="section-block rules-page">
      <div className="section-heading"><div><p className="kicker">How it works</p><h2>Rules</h2></div></div>
      <div className="rules-list">
        <article><span>01</span><div><h3>Snake draft</h3><p>The order reverses every round. Owners at the ends of the snake can have consecutive picks.</p></div></article>
        <article><span>02</span><div><h3>One player per conference</h3><p>Once you roster a player from a conference, you cannot select another player from that conference.</p></div></article>
        <article><span>03</span><div><h3>12-hour demo clock</h3><p>Each live pick receives the full clock. The real draft clock will be set by the commissioner before launch.</p></div></article>
        <article><span>04</span><div><h3>Expired picks are owed</h3><p>If your clock expires, the draft moves on. Your original slot remains yours and can be backfilled later.</p></div></article>
        <article><span>05</span><div><h3>Oldest owed pick first</h3><p>If you owe more than one pick, fill the oldest outstanding slot before a newer one.</p></div></article>
        <article><span>06</span><div><h3>Write-ins</h3><p>If an eligible player is missing from the pool, the drafting owner will be able to add a write-in when drafting is enabled.</p></div></article>
      </div>
    </section>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('Draft');

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <div className="logo-block">
            <span className="logo-main">{PROJECT_NAME}</span>
            <span className="logo-sub">Sickos League · read-only demo</span>
          </div>
          <span className="spectator-pill"><span /> Spectator</span>
        </div>
        <nav className="tabs" aria-label="Primary navigation">
          {pages.map((item) => (
            <button
              type="button"
              key={item}
              className={item === page ? 'tab active' : 'tab'}
              onClick={() => setPage(item)}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {page === 'Draft' && <DraftPage />}
        {page === 'Players' && <PlayersPage />}
        {page === 'Teams' && <TeamsPage />}
        {page === 'Rules' && <RulesPage />}
      </main>
    </div>
  );
}
