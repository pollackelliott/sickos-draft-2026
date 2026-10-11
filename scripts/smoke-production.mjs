const baseUrl = process.env.SICKOS_BASE_URL?.replace(/\/$/, '');
const commissionerCode = process.env.SICKOS_COMMISSIONER_CODE?.trim();
const ordinaryCode = process.env.SICKOS_ORDINARY_CODE?.trim();

if (!baseUrl) throw new Error('SICKOS_BASE_URL is required.');
if (!commissionerCode) throw new Error('SICKOS_COMMISSIONER_CODE is required.');
if (!ordinaryCode) throw new Error('SICKOS_ORDINARY_CODE is required.');

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

const checks = [];

const health = await request('/api/health');
checks.push(['health', health.response.status === 200 && health.body?.ok === true]);

const draft = await request('/api/draft');
const noCodes = draft.response.status === 200 &&
  Array.isArray(draft.body?.owners) &&
  draft.body.owners.length === 14 &&
  draft.body.owners.every((owner) => !Object.hasOwn(owner, 'code')) &&
  draft.body.lifecycle === 'NOT_STARTED' &&
  draft.body.slots?.length === 252;
checks.push(['public draft shape/no code leakage', noCodes]);

const players = await request('/api/players?limit=1');
checks.push(['player universe present', players.response.status === 200 && players.body?.total === 6322]);

const commissioner = await request('/api/me', {
  headers: { 'x-league-code': commissionerCode },
});
checks.push(['commissioner identity', commissioner.response.status === 200 && commissioner.body?.owner?.isCommissioner === true]);

const ordinary = await request('/api/me', {
  headers: { 'x-league-code': ordinaryCode },
});
checks.push(['ordinary identity', ordinary.response.status === 200 && ordinary.body?.owner?.isCommissioner === false]);

const forbidden = await request('/api/commissioner/prestart-owners', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-league-code': ordinaryCode,
  },
  body: JSON.stringify({ owners: [] }),
});
checks.push(['non-commissioner blocked', forbidden.response.status === 403]);

const missing = await request('/api/not-a-route');
checks.push(['unknown API is JSON 404', missing.response.status === 404 && missing.body?.error === 'API route not found.']);

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
}
if (failed.length) {
  throw new Error(`${failed.length} production smoke check(s) failed.`);
}
