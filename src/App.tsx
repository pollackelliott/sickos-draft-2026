import { useCallback, useEffect, useState } from 'react';
import { ApiError, DraftApiClient, type PublicDraft, type SessionOwner } from './api/client';
import { PROJECT_NAME } from './project';
import { clearStoredOwnerCode, readStoredOwnerCode, storeOwnerCode } from './ui/identity-storage';
import { errorMessage } from './ui/errors';
import { IdentityModal } from './ui/modals';
import { DraftPage } from './ui/draft-page';
import { PlayersPage } from './ui/players-page';
import { TeamsPage } from './ui/teams-page';
import { RulesPage } from './ui/rules-page';
import { CommissionerPage } from './ui/commissioner-page';

type Page = 'Draft' | 'Players' | 'Teams' | 'Rules' | 'Commissioner';
const publicPages: Page[] = ['Draft', 'Players', 'Teams', 'Rules'];
const api = new DraftApiClient();

export function App() {
  const [page, setPage] = useState<Page>('Draft');
  const [draft, setDraft] = useState<PublicDraft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [code, setCode] = useState<string | null>(() => readStoredOwnerCode(window.localStorage));
  const [owner, setOwner] = useState<SessionOwner | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);

  const refreshDraft = useCallback(async () => {
    try {
      const next = await api.getDraft();
      setDraft(next);
      setDraftError('');
    } catch (caught) {
      setDraftError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void refreshDraft();
    const interval = window.setInterval(() => { void refreshDraft(); }, 45_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshDraft(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, [refreshDraft]);

  useEffect(() => {
    if (!code) { setOwner(null); return; }
    let cancelled = false;
    void api.getMe(code).then((nextOwner) => { if (!cancelled) setOwner(nextOwner); }).catch((caught) => {
      if (cancelled) return;
      if (caught instanceof ApiError && caught.status === 401) {
        clearStoredOwnerCode(window.localStorage);
        setCode(null);
        setOwner(null);
      }
    });
    return () => { cancelled = true; };
  }, [code]);

  function acceptIdentity(nextOwner: SessionOwner, rawCode: string) {
    const normalized = storeOwnerCode(window.localStorage, rawCode);
    setCode(normalized);
    setOwner(nextOwner);
    setIdentityOpen(false);
  }

  function changeUser() {
    clearStoredOwnerCode(window.localStorage);
    setCode(null);
    setOwner(null);
    setPage('Draft');
    setIdentityOpen(true);
  }

  const pages = owner?.isCommissioner ? [...publicPages, 'Commissioner' as const] : publicPages;

  useEffect(() => {
    if (page === 'Commissioner' && !owner?.isCommissioner) setPage('Draft');
  }, [owner?.isCommissioner, page]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <div className="logo-block"><span className="logo-main">{PROJECT_NAME}</span><span className="logo-sub">Sickos League · 2026 draft</span></div>
          {owner ? <div className="identity-box"><span className="spectator-pill owner-pill"><span /> {owner.name}</span><button type="button" onClick={changeUser}>Change user</button></div>
            : <button type="button" className="spectator-pill login-pill" onClick={() => setIdentityOpen(true)}><span /> Enter code</button>}
        </div>
        <nav className="tabs" aria-label="Primary navigation">{pages.map((item) => <button type="button" key={item} className={item === page ? 'tab active' : 'tab'} onClick={() => setPage(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>)}</nav>
      </header>

      <main className="content">
        {draftError && <section className="load-error"><strong>Draft unavailable</strong><span>{draftError}</span><button type="button" className="button secondary compact" onClick={() => void refreshDraft()}>Try again</button></section>}
        {!draft && !draftError && <p className="empty-state page-loading">Loading draft…</p>}
        {draft && page === 'Draft' && <DraftPage draft={draft} owner={owner} onGoPlayers={() => setPage('Players')} />}
        {draft && page === 'Players' && <PlayersPage draft={draft} owner={owner} code={code} onDraftChanged={(next) => { setDraft(next); setPage('Draft'); }} />}
        {draft && page === 'Teams' && <TeamsPage draft={draft} />}
        {draft && page === 'Rules' && <RulesPage draft={draft} />}
        {draft && page === 'Commissioner' && owner?.isCommissioner && code && (
          <CommissionerPage draft={draft} code={code} onDraftChanged={setDraft} />
        )}
      </main>

      <IdentityModal open={identityOpen} onClose={() => setIdentityOpen(false)} onSuccess={acceptIdentity} />
    </div>
  );
}
