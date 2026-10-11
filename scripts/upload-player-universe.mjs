import { readFileSync } from 'node:fs';

const baseUrl = process.env.SICKOS_BASE_URL?.replace(/\/$/, '');
const commissionerCode = process.env.SICKOS_COMMISSIONER_CODE?.trim();
const playerFile = process.env.SICKOS_PLAYER_UNIVERSE?.trim();

if (!baseUrl) throw new Error('SICKOS_BASE_URL is required.');
if (!commissionerCode) throw new Error('SICKOS_COMMISSIONER_CODE is required.');
if (!playerFile) throw new Error('SICKOS_PLAYER_UNIVERSE is required.');

const csv = readFileSync(playerFile, 'utf8');
const response = await fetch(`${baseUrl}/api/commissioner/player-universe`, {
  method: 'POST',
  headers: {
    'content-type': 'text/csv; charset=utf-8',
    'x-league-code': commissionerCode,
  },
  body: csv,
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Player universe upload failed (${response.status}): ${body}`);
}

console.log(body);
