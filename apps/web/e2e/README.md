# PTaaS E2E Test Suite (Playwright)

## Setup

```bash
# Install Playwright browsers (one-time)
npx playwright install --with-deps

# Copy env vars
cp .env.example .env.e2e
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | Frontend URL |
| `E2E_USER_EMAIL` | `admin@ptaas.local` | Test user email |
| `E2E_USER_PASSWORD` | `Test1234!secure` | Test user password |
| `E2E_TOTP_CODE` | — | Current TOTP code (only needed if MFA enabled on test account) |

## Running Tests

```bash
# All E2E tests (headless)
npm run test:e2e --workspace=apps/web

# Interactive UI mode
npm run test:e2e:ui --workspace=apps/web

# Headed (visible browser)
npm run test:e2e:headed --workspace=apps/web

# Specific spec file
npx playwright test e2e/dashboard.spec.ts

# Specific project (browser)
npx playwright test --project=chromium

# Mobile only
npx playwright test --project=mobile

# View last report
npm run test:e2e:report --workspace=apps/web
```

## Test Structure

```
e2e/
├── auth.setup.ts          # Global auth setup — runs once, saves session
├── auth.spec.ts           # Login/logout flows (no saved session)
├── dashboard.spec.ts      # Dashboard KPIs, nav, mobile menu
├── projects.spec.ts       # Projects list, create, detail
├── findings.spec.ts       # Findings/SLA/Assets pages
├── settings.spec.ts       # All settings sub-pages
├── scan.spec.ts           # Scan list, detail, start
├── pages/
│   ├── login.page.ts      # LoginPage POM
│   └── app.page.ts        # AppPage POM (shared header)
├── fixtures/
│   └── test.ts            # Extended test with POM fixtures
└── .auth/
    └── user.json          # Saved auth state (gitignored)
```

## Notes

- Tests that depend on seeded projects use `test.skip()` gracefully if no data exists
- Auth state is shared across `chromium`, `firefox`, and `mobile` projects via `storageState`
- `auth-tests` project runs without saved session to test the login flow itself
