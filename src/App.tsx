import { PROJECT_NAME, PROJECT_STAGE } from './project';

const pages = ['Draft', 'Players', 'Teams', 'Rules'];

export function App() {
  return (
    <main className="shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Sickos League</p>
          <h1>{PROJECT_NAME}</h1>
        </div>
        <nav aria-label="Primary navigation">
          {pages.map((page) => (
            <span key={page}>{page}</span>
          ))}
        </nav>
      </header>

      <section className="placeholder" aria-labelledby="stage-title">
        <p className="status">FOUNDATION ONLY</p>
        <h2 id="stage-title">{PROJECT_STAGE}</h2>
        <p>
          Draft rules, persistence, authentication, player search, commissioner controls,
          timers, and production UI are intentionally not implemented yet.
        </p>
      </section>
    </main>
  );
}
