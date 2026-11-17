# Hood Spot POS

A browser-based bar register and owner dashboard, adapted from WebDevPro’s UltraMax 7 Pro template. Preserves the navy/teal design, mobile bottom navigation, accessible motion and installable PWA shell. Checkout uses a versioned REST API with an isolated Neon Postgres demo workspace.

| Role | Username | Demo password |
| --- | --- | --- |
| Owner | owner | Owner@2026 |
| Cashier | cashier | Till@2026 |

Sign in without a workspace code to create an isolated demo with sample products and transactions. To see the same stock and sales from a second device, copy the code from Workspace settings. Use the same code but sign in as the appropriate role. Demo role credentials are public, so share a workspace code only with the demo audience. All money in the app is USD, recorded in cents. Reports use Africa/Harare time.

## Run and deploy

1. Use Node 22 and run `npm ci`.
2. Apply `db/001_demo.sql` to a dedicated Postgres database (the initial migration installs schema and stored functions).
3. Set `DATABASE_URL` to the server-only connection URL. For local development use `node --env-file=.env server/dev.mjs`.
4. `npm test` and `npm run build`. The Vercel config builds the static PWA and routes `/api/v1/*` to one Node function.
5. For deployment, set `DATABASE_URL` in Vercel and deploy the GitHub branch. Do not reuse the demo database for real takings.

## Behavior

- Cash, EcoCash and card are recorded payment methods. The app does not take or verify payments or store card data.
- Online checkout snapshots prices and costs, records the receipt and deducts stock in one database transaction. Retries reuse the same UUID and verify the original payload. Cashier sessions cannot read owner reports, costs or employee controls.
- Offline selling requires at least one successful online sign-in and a cached catalog on the same device. Queued sales are kept in browser storage under the cashier and workspace, then retried when the connected app is opened or comes back online. The API flags depleted stock or changed prices rather than applying them silently. Browser storage must be retained.
- Receipts render at 80 mm for OS-installed thermal printers. Optional auto-print opens the browser print dialog. Silent printing requires an independently configured kiosk or print bridge. Demo receipts are not fiscal invoices.
- The owner report refreshes while open, shows rolling 7- and 30-day windows, and reports gross profit, not net profit.

The live API reference is at `/api-reference.html`. The public health check is `/api/v1/health`.
