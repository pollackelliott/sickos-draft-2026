# Stage 7 — Cloudflare Deployment Runbook

This runbook deploys the sealed Sickos Draft 2026 application to Cloudflare Workers + D1.

Do not press **Start Draft** during deployment or smoke testing. The real draft must remain `NOT_STARTED` until the final order is settled.

## Required private inputs

Keep these outside Git:

1. the private owner-code CSV generated after Stage 6C;
2. the sealed Stage 6A player universe:
   - rows: 6,322
   - SHA-256: `b59ec2cd479ea89e3fdf85399c5a5f26f76fb25442c39f59caa2fe4e52e1adae`;
3. Cloudflare account authentication.

## 1. Install and validate

```bash
npm install
npm run typecheck
npm test
npm run build
npm run deploy:check
```

## 2. Authenticate Cloudflare

Either use Wrangler login interactively:

```bash
npx wrangler login
```

or provide the standard Cloudflare environment variables:

```bash
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_API_TOKEN="..."
```

Never commit these values.

## 3. Create the production D1 database

Run once:

```bash
npx wrangler d1 create sickos-draft-2026
```

Capture the returned D1 database UUID, then:

```bash
export SICKOS_D1_DATABASE_ID="<database UUID>"
node scripts/write-wrangler-config.mjs
```

The generated `.wrangler.deploy.jsonc` is ignored by Git.

## 4. Apply migrations

```bash
npm run d1:migrate
```

This applies the repository-owned migrations under `migrations/` to the remote D1 database.

## 5. Bootstrap the real 14-manager draft

Generate bootstrap SQL from the private owner-code sheet:

```bash
node scripts/generate-bootstrap-sql.mjs --codes-file="/absolute/path/to/sickos-draft-2026-private-owner-codes.csv"
```

The generated `.wrangler/bootstrap.sql` is ignored by Git and contains the private league codes. It deliberately contains no SQL `BEGIN`, `COMMIT`, or `SAVEPOINT` statements because Wrangler's remote D1 file execution manages the operation and rejects explicit SQL transaction control.

Apply it exactly once:

```bash
npx wrangler d1 execute DB --remote --file=.wrangler/bootstrap.sql --config .wrangler.deploy.jsonc
```

The bootstrap inserts:

- 14 stable owners;
- Elliott Pollack as sole commissioner;
- the provisional alphabetical first-round order;
- 18 rounds;
- a 24-hour clock;
- 252 FUTURE snake slots;
- lifecycle `NOT_STARTED`.

Re-running bootstrap against a populated database is intentionally expected to fail rather than silently replace live state.

## 6. Deploy Worker + React assets

```bash
npm run deploy:cloudflare
```

Wrangler prints the deployed Workers URL. Record it:

```bash
export SICKOS_BASE_URL="https://<deployed-worker-url>"
```

## 7. Upload the sealed 6,322-player universe

Set the commissioner code privately:

```bash
export SICKOS_COMMISSIONER_CODE="<Elliott's league code>"
export SICKOS_PLAYER_UNIVERSE="/absolute/path/to/stage6a_player_universe_final.csv"
npm run players:upload
```

The upload utility verifies the sealed SHA-256 before sending the CSV. A different player file is rejected unless an intentional later refresh explicitly opts out of the Stage 6A hash guard.

## 8. Run non-destructive production smoke checks

Choose any ordinary owner's code:

```bash
export SICKOS_ORDINARY_CODE="<ordinary owner code>"
npm run smoke:production
```

Smoke checks verify:

- `/api/health`;
- public draft state is `NOT_STARTED`;
- 14 public owners and 252 slots;
- owner codes do not leak in public draft JSON;
- player search reports exactly 6,322 players;
- Elliott's code resolves as commissioner;
- an ordinary code resolves without commissioner powers;
- an ordinary owner is denied commissioner setup access;
- unknown `/api/*` paths return JSON 404 rather than the React SPA.

## 9. Final pre-start edits

Before Start Draft, the commissioner may safely update:

- Jake's display name when his surname is known;
- the complete first-round draft order.

Use the Stage 6C pre-start owner setup path. Stable owner IDs and league codes remain unchanged.

Once the draft starts, owner order is locked.

## 10. Production proof before declaring Stage 7 complete

Record:

- exact deployed Worker URL;
- D1 database name and UUID;
- exact Git SHA deployed;
- migration success;
- bootstrap success;
- sealed player-upload result;
- smoke-test PASS output;
- final owner/order state still `NOT_STARTED`.

Only then is Stage 7 complete and Stage 8 mock-draft testing authorized.
