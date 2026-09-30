import type { PublicDraft } from '../api/client';

export function RulesPage(props: { draft: PublicDraft }) {
  const hours = Math.round(props.draft.config.clockDurationMs / 3_600_000);
  return (
    <section className="section-block rules-page"><div className="section-heading"><div><p className="kicker">How it works</p><h2>Rules</h2></div></div><div className="rules-list">
      <article><span>01</span><div><h3>Snake draft</h3><p>The order reverses every round. Owners at the ends of the snake can have consecutive picks.</p></div></article>
      <article><span>02</span><div><h3>One player per conference</h3><p>Once you roster a player from a conference, you cannot select another player from that conference.</p></div></article>
      <article><span>03</span><div><h3>{hours}-hour clock</h3><p>Each live pick receives the full current clock. A new clock begins immediately after a valid pick or expiration.</p></div></article>
      <article><span>04</span><div><h3>Expired picks are owed</h3><p>If your clock expires, the draft moves on. Your original slot remains yours and can be backfilled later.</p></div></article>
      <article><span>05</span><div><h3>Oldest owed pick first</h3><p>If you owe more than one pick, fill the oldest outstanding owed slot before a newer owed slot.</p></div></article>
      <article><span>06</span><div><h3>Write-ins</h3><p>If an eligible player is missing from the pool, use Write-in while you have an available draft slot. Existing Name + School matches must use the existing player.</p></div></article>
    </div></section>
  );
}

