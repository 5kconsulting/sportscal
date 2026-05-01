# SportsCal inbound mail Worker

Catches mail to `add+<token>@inbox.sportscalapp.com`, parses MIME, and POSTs a
JSON envelope to the SportsCal backend at `/api/inbound/mail`.

## One-time setup

### 1. Generate the shared secret

```bash
openssl rand -hex 32
```

You'll set this same value as `INTAKE_SECRET` on the Worker AND `INBOUND_SECRET`
on Railway. The backend's `/api/inbound/mail` route compares the incoming
`X-Intake-Secret` header against `INBOUND_SECRET`.

### 2. Set Railway env

In the Railway dashboard for the SportsCal backend service:

- `INBOUND_SECRET=<the value from step 1>`
- `INBOUND_DOMAIN=inbox.sportscalapp.com` (optional; this is the default)

Restart the service so the new env is picked up.

### 3. Deploy the Worker

```bash
cd cloudflare/inbound-mail
npm install
npx wrangler login              # one-time browser auth
npx wrangler secret put INTAKE_SECRET   # paste the same value
npx wrangler deploy
```

`wrangler deploy` bundles `postal-mime` and uploads the Worker. The Worker is
named `sportscal-inbound-mail` (per `wrangler.toml`).

### 4. Configure Email Routing in the Cloudflare dashboard

1. Pick the zone (`sportscalapp.com`) → **Email** → **Email Routing**.
2. Click **Get started** if you haven't enabled routing on this zone yet.
   Cloudflare will offer to add the required MX + TXT records to your DNS.
   Accept; this only adds records for the `inbox` subdomain handling — it does
   NOT touch any existing MX records on the apex domain.
3. **Routing rules** → **Catch-all** → **Send to a Worker** →
   pick `sportscal-inbound-mail`.
4. Confirm the catch-all is scoped to `inbox.sportscalapp.com` (Cloudflare
   walks you through the subdomain MX setup the first time).

### 5. Smoke test

Send any email to `add+abc123@inbox.sportscalapp.com` from your personal account
(any token — the backend will respond with "unknown-token" since `abc123` isn't
registered to a user, but you'll see the request hit the Worker and the
backend logs).

```bash
npx wrangler tail   # live tail of Worker logs
```

You should see the Worker log the parse + the POST status. On Railway, the
backend will log `[inbound] token abc123 matched no user`.

When you forward a real email containing a calendar URL to your real
`add+<your-token>@inbox.sportscalapp.com` address, you'll get a confirmation
email back within seconds.

## Architecture notes

- The Worker authenticates to the backend with a shared secret
  (`X-Intake-Secret` header). No HMAC over the body. Both ends are ours, the
  Worker speaks only to this endpoint over HTTPS, and the secret is
  high-entropy.
- The Worker accepts the email at the SMTP layer even when the backend errors
  or is unreachable. Bouncing a forwarded email back to the parent is worse UX
  than silently dropping with a Worker-side log.
- `message.raw` is a `ReadableStream` and `postal-mime` consumes it natively.
  No buffering needed in the Worker.
- `message.to` (the envelope) is what the routing rule matched and is the
  authoritative source for the `add+<token>` token. The `To:` MIME header may
  say something else (e.g. when the parent forwards an email).

## Re-deploys

After editing `src/index.js`:

```bash
cd cloudflare/inbound-mail
npx wrangler deploy
```

That's it — the new build replaces the old one atomically and inbound mail
keeps flowing.
