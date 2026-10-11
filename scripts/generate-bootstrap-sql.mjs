import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const finishRow = () => {
    row.push(field);
    field = '';
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && ch === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      finishRow();
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('Unclosed quote in CSV.');
  if (field.length || row.length) finishRow();
  return rows;
}

function csvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) =>
    Object.fromEntries(header.map((key, index) => [key, values[index]?.trim() ?? ''])),
  );
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const codesFileArg = process.argv.find((arg) => arg.startsWith('--codes-file='));
const codesFile = codesFileArg?.slice('--codes-file='.length);
if (!codesFile) {
  throw new Error('Pass --codes-file=/path/to/private-owner-codes.csv');
}

const ownerRows = csvObjects(readFileSync('data/stage6c/league-owners.csv', 'utf8'));
const codeRows = csvObjects(readFileSync(codesFile, 'utf8'));
const settings = JSON.parse(readFileSync('data/stage6c/league-settings.json', 'utf8'));

const codes = new Map(codeRows.map((row) => [row['Owner ID'], row['League Code']]));
if (codes.size !== ownerRows.length) {
  throw new Error(`Expected ${ownerRows.length} private owner codes; found ${codes.size}.`);
}

const normalizedCodes = new Set();
for (const owner of ownerRows) {
  const code = codes.get(owner.owner_id)?.trim().toUpperCase();
  if (!code) throw new Error(`Missing private code for ${owner.owner_id}.`);
  if (normalizedCodes.has(code)) throw new Error(`Duplicate private code: ${code}.`);
  normalizedCodes.add(code);
}

const rounds = Number(settings.rounds);
const clockMs = Number(settings.initial_clock_hours) * 60 * 60 * 1000;
const ordered = [...ownerRows].sort(
  (a, b) => Number(a.provisional_draft_position) - Number(b.provisional_draft_position),
);

const lines = [
  'PRAGMA foreign_keys = ON;',
  'BEGIN TRANSACTION;',
  `INSERT INTO drafts (id, rounds, clock_duration_ms, lifecycle, paused, revision) VALUES ('active', ${rounds}, ${clockMs}, 'NOT_STARTED', 0, 0);`,
];

for (const owner of ordered) {
  const code = codes.get(owner.owner_id).trim().toUpperCase();
  lines.push(
    `INSERT INTO owners (id, name, draft_position, code, is_commissioner) VALUES (${sql(owner.owner_id)}, ${sql(owner.name)}, ${Number(owner.provisional_draft_position)}, ${sql(code)}, ${owner.is_commissioner === 'true' ? 1 : 0});`,
  );
}

let overallPick = 1;
for (let round = 1; round <= rounds; round += 1) {
  const roundOwners = round % 2 === 1 ? ordered : [...ordered].reverse();
  roundOwners.forEach((owner, index) => {
    lines.push(
      `INSERT INTO draft_slots (id, draft_id, round, round_pick, overall_pick, owner_id, status) VALUES (${sql(`R${round}-P${index + 1}`)}, 'active', ${round}, ${index + 1}, ${overallPick}, ${sql(owner.owner_id)}, 'FUTURE');`,
    );
    overallPick += 1;
  });
}

lines.push('COMMIT;', '');
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/bootstrap.sql', lines.join('\n'));
console.log(`Wrote private bootstrap SQL for ${ordered.length} owners and ${overallPick - 1} slots.`);
