# PlateTrack

> Income & expense tracker for UK self-employed trade plate drivers

PlateTrack is a Progressive Web App (PWA) that helps gig economy trade plate drivers manage their finances — tracking earnings across multiple companies, logging business expenses, monitoring mileage, reconciling payslips, and getting AI-powered financial insights.

---

## Features

### Income Tracking
- Record earnings per job with company, income type, start/end times, miles, and vehicle registration
- Customisable income types (Delivery, Waiting Time, Charging Time, Bonus, and user-defined)
- Postcode-to-postcode mileage calculation via Postcode.io

### Expense Management
- 15 expense categories covering fuel, travel, EV charging, tolls, cleaning, parking, hotel, and more
- Reimbursed vs. non-reimbursed tracking per category
- Link expenses to specific job references
- Receipt photo capture with automatic OCR (Claude Vision API)

### Jobs Overview
- Per-job profit summary (income minus deductible expenses)
- Long-press drag-and-drop card reordering
- Company colour-coded cards

### Payslip Cross-Check
- Upload payslip images for OCR parsing via Claude Vision
- Match extracted line items against logged income/expenses
- Reconcile discrepancies across a custom date range

### Analytics & Insights
- Monthly/weekly profit charts (SVG donut and bar charts)
- Category expense breakdowns
- UK tax estimate (income tax + National Insurance)
- Allocation dashboard — split earnings into Tax, Invest, Bills, and Spendable buckets

### AI Assistant
- Chat interface powered by Claude API (via Cloudflare Workers proxy)
- Contextual financial advice, spending summaries, and tax planning
- Smart Actions: quick prompts for spending review, receipts, and tax tips

### Cloud Sync & Authentication
- Optional Supabase account for cross-device sync
- Offline-first: all data persisted in localStorage, synced when online
- Receipt images stored in Supabase Storage (with local base64 fallback)

### Other
- CSV export of income and expenses
- Dark / Light / Gold / Purple / Blue themes
- Installable PWA (iOS & Android home screen)
- Free tier: 10 income + 10 expense entries; Pro unlocks unlimited

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (no framework, no build step) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT, email/password) |
| File Storage | Supabase Storage |
| AI / OCR | Claude API via Cloudflare Workers (`platetrack-ai.tyburtonc.workers.dev`) |
| Geocoding | Postcode.io REST API |
| Deployment | Single `index.html` — host anywhere |

---

## Architecture

```
Browser (PWA)
├── index.html          ← Entire application (~4,700 lines)
│   ├── CSS             ← Theming, responsive layout, animations
│   └── JavaScript      ← Business logic, UI rendering, API calls
│
├── localStorage        ← Primary offline store (income, expenses, settings)
├── sessionStorage      ← Temporary backup fallback
│
├── Supabase            ← Cloud sync (when logged in)
│   ├── PostgreSQL      ← users, income, expenses tables
│   └── Storage         ← Receipt JPEG images
│
└── Cloudflare Worker   ← Serverless AI proxy
    └── Claude API      ← Receipt OCR, payslip parsing, chat assistant
```

**Offline-first design:** All reads and writes go to localStorage first. When the user is authenticated, data is pushed to / pulled from Supabase on login and periodically thereafter.

---

## Database Schema

### Table: `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | TEXT | |
| `name` | TEXT | Display name |
| `companies` | JSONB | Array of company config objects |
| `income_types` | JSONB | Array of custom income type strings |
| `job_meta` | JSONB | `{jobs, notes}`: job statuses/notes and quick notes. Add with `supabase/job-meta.sql` |
| `created_at` | TIMESTAMP | |

### Table: `income`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Client-generated |
| `user_id` | UUID | Foreign key |
| `date` | DATE | |
| `company` | TEXT | |
| `income_type` | TEXT | |
| `amount` | NUMERIC | GBP |
| `job_ref` | TEXT | Optional |
| `start_time` | TEXT | HH:MM |
| `end_time` | TEXT | HH:MM |
| `miles` | NUMERIC | Optional |
| `registration` | TEXT | Vehicle plate |
| `start_postcode` | TEXT | |
| `end_postcode` | TEXT | |
| `description` | TEXT | |
| `created_at` | TIMESTAMP | |

### Table: `expenses`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | Client-generated |
| `user_id` | UUID | Foreign key |
| `date` | DATE | |
| `category` | TEXT | See categories below |
| `amount` | NUMERIC | GBP |
| `company` | TEXT | Optional |
| `job_ref` | TEXT | Optional |
| `receipt` | TEXT | Receipt reference number |
| `description` | TEXT | |
| `receipt_image` | TEXT | Supabase storage path or empty |
| `created_at` | TIMESTAMP | |

### Storage Bucket: `Receipts`
```
Receipts/{userId}/{expenseId}.jpg
```
Images are compressed client-side (max 1200px, JPEG 0.82 quality) before upload.

---

## Key Data Models

### Income Entry
```javascript
{
  id, date, company, incomeType, amount,
  jobRef, startTime, endTime, miles,
  registration, startPostcode, endPostcode, description
}
```

### Expense Entry
```javascript
{
  id, date, category, amount, company,
  jobRef, receipt, description, receiptImage
}
```

### Company
```javascript
{
  name: "BCA",
  paletteIdx: 0,          // index into 7-colour palette
  expenseDefaults: {
    travel: true, fuel: true, ev: false,
    tolls: true, cleaning: false, parking: true, hotel: false
  }
}
```

### Allocation
```javascript
{ invest: 20, bills: 10 }   // percentages; remainder = spendable
```

### Goal
```javascript
{ active: true, type: "weekly" | "monthly", amount: 500 }
```

### Payslip
```javascript
{
  image: "<base64>",
  manualTotal: "450.00",
  status: "done" | "scanning" | "error" | "",
  periodFrom: "YYYY-MM-DD",
  periodTo: "YYYY-MM-DD",
  items: [{ ref, description, company, amount }]
}
```

---

## Navigation

| Tab | Name | Function | Description |
|---|---|---|---|
| 0 | Dashboard | `rDash()` | Today/week/month income, job cards, allocations, goals |
| 1 | Jobs | `rJobsOverview()` | Per-job profit with drag-and-drop reordering |
| 2 | Expenses | `rExpenses()` | Expense list, category filter, receipt viewer |
| 3 | Insights | `rSummary()` | Annual P&L, tax estimate, payslip cross-check |
| 4 | AI | `rAI()` | Claude chat assistant |

---

## Expense Categories

```
Travel (Reimbursed)      Travel (Not Reimbursed)
Fuel (Reimbursed)        Fuel (Not Reimbursed)
EV Charging (Reimbursed) EV Charging (Not Reimbursed)
Tolls (Reimbursed)       Tolls (Not Reimbursed)
Cleaning (Reimbursed)    Cleaning (Not Reimbursed)
Parking (Reimbursed)     Parking (Not Reimbursed)
Hotel (Reimbursed)       Hotel (Not Reimbursed)
Other
```

Travel sub-types: Train, Bus, Uber, Taxi, TFL, Tube, Ferry, Other

---

## Authentication

PlateTrack uses Supabase JWT authentication (email + password).

**Flow:**
1. User signs up → Supabase creates auth user and row in `users` table
2. User signs in → receives `access_token` + `refresh_token`
3. Session persisted in `localStorage` (`pt_sess`)
4. All cloud API calls carry `Authorization: Bearer {access_token}`
5. Tokens auto-refresh on 401 responses
6. Sign out clears the in-memory session

Authentication is **optional** — the app runs fully offline without an account.

---

## Configuration

### Feature Flags (in `index.html`)
```javascript
PUBLIC_BUILD = false         // true = public prototype mode
FREE_INCOME_LIMIT = 10       // max free tier income entries
FREE_EXPENSE_LIMIT = 10      // max free tier expense entries
```

### LocalStorage Keys
| Key | Contents |
|---|---|
| `pt9` | Serialised `DB` object (income, expenses, jobOrder, jobs, notes) |
| `pt_last_backup` | Timestamp of the last JSON backup (drives the backup reminder) |
| `pt_exp_render` / `pt_exp_safe` | Expenses tab crash breadcrumb / safe-mode flag |

Receipts saved while signed out are stored in IndexedDB (`platetrack` → `receipts`) and referenced from the expense as `idb:<key>`.
| `pt_companies` | Array of company config objects |
| `pt_income_types` | Array of income type strings |
| `pt_name` | User display name |
| `pt_payslip` | Payslip state (image, dates, items) |
| `pt_alloc` | Allocation percentages |
| `pt_goal` | Goal settings |
| `pt_ai_msgs` | AI chat history |
| `pt_pro` | `"true"` if Pro unlocked |
| `pt_sess` | Supabase session token |
| `pt_theme` | `"dark"` or `"light"` |
| `pt_color_theme` | `"purple"`, `"gold"`, or `"blue"` |

---

## Getting Started

PlateTrack requires no installation or build step.

1. Open `index.html` in any modern mobile or desktop browser
2. (Optional) Install as a PWA — tap **Add to Home Screen** on iOS/Android
3. Start logging income and expenses
4. Create a free account to enable cloud sync across devices

---

## Development

`index.html` is the source; `docs/` is the minified build that GitHub Pages serves.

```
npm install
npm run build   # minify index.html into docs/ and stamp the service worker cache version
npm test        # build, then run the browser tests in test/ (headless Chromium via Playwright)
```

Always commit the rebuilt `docs/` alongside changes to `index.html`.

### Supabase security
`supabase/rls.sql` turns on Row Level Security so each signed-in user can only read and change their own `users`, `income` and `expenses` rows and their own files in the `Receipts` bucket. Run it once in the Supabase SQL editor; it is safe to re-run.

### AI worker
`platetrack-ai-worker/` is the Cloudflare Worker behind receipt/payslip scanning and the AI assistant. It only serves signed-in users calling from the app's own site, fixes the model and output cap server-side, and keeps the Anthropic key as a worker secret. The **Deploy AI worker** GitHub Action deploys it on every change to that folder on `main` (repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`). `cd platetrack-ai-worker && npm test` runs its tests.

Ideas for later live in `BACKLOG.md`.

### UK Tax Calculations
Estimates use each tax year's own HMRC rates for England, Wales & NI (`TAX_RATES` and `ukTax()` in `index.html`, 2021/22 onwards; later years use the latest rates). Tax years run 6 April–5 April and are worked out from the date text, so time zones can't shift an entry. `test/figures.test.js` checks every figure against hand-worked HMRC answers. For 2026/27:
- Personal Allowance: £12,570, reduced by £1 for every £2 of profit over £100,000
- Basic Rate (20%): first £37,700 of taxable income
- Higher Rate (40%): up to £125,140
- Additional Rate (45%): above £125,140
- Class 4 National Insurance: 6% on profits between £12,570 and £50,270, 2% above
