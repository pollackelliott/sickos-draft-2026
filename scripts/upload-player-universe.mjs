import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const baseUrl = process.env.SICKOS_BASE_URL?.replace(/\/$/, '');
const commissionerCode = process.env.SICKOS_COMMISSIONER_CODE?.trim();
const playerFile = process.env.SICKOS_PLAYER_UNIVERSE?.trim();

if (!baseUrl) throw new Error('SICKOS_BASE_URL is required.');
if (!commissionerCode) throw new Error('SICKOS_COMMISSIONER_CODE is required.');
if (!playerFile) throw new Error('SICKOS_PLAYER_UNIVERSE is required.');

const csv = readFileSync(playerFile, 'utf8');
const actualSha256 = createHash('sha256').update(csv).digest('hex');
const expectedSha256 = process.env.SICKOS_EXPECTED_PLAYER_SHA256?.trim()
  || 'b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae';

if (
  actualSha256 !== expectedSha256 &&
  process.env.SICKOS_ALLOW_UNSEALED_PLAYER_UPLOAD !== '1'
) {
  throw new Error(
    'Player universe SHA-256 mismatch. Expected ' + expectedSha256 + '; found ' + actualSha256 + '. ' +
    'Set SICKOS_ALLOW_UNSEALED_PLAYER_UPLOAD=1 only for an intentional later refresh.',
  );
}

const response = await fetch(baseUrl + '/api/commissioner/player-universe', {
  method: 'POST',
  headers: {
    'content-type': 'text/csv; charset=utf-8',
    'x-league-code': commissionerCode,
  },
  body: csv,
});

const body = await response.text();
if (!response.ok) {
  throw new Error('Player universe upload failed (' + response.status + '): ' + body);
}

console.log('Uploaded player universe SHA-256 ' + actualSha256 + '.');
console.log(body);
