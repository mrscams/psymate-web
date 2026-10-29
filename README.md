# psymate-web

Clinician dashboard for psyMate (Angular 21, standalone components, zoneless).

## Run

1. Start the API first (see `psymate-api`), so it listens on http://localhost:8080.
2. Run the dev server:

   ```bash
   npm install
   npm start
   ```

3. Open http://localhost:4200. Requests to `/api` are proxied to the API (see `proxy.conf.json`).
   The sidebar shows whether the API is reachable.

## Test and build

```bash
npm test -- --watch=false
npm run build
```

## Structure

- `src/app/caseload`: caseload overview (placeholder)
- `src/app/patient-detail`: single-patient view at `/patients/:id` (placeholder)
