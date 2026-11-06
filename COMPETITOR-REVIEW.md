# Competitor review and plan (November 2026)

This compares 13 screenshots of a competing trade plate driver app with PlateTrack v2 (`/Plate-Track/v2/`). The screenshots cover its home screen, reminders, notes, vehicle check, calendar, earnings and job page.

## Summary
- **The competitor is built around doing the job.** It has a vehicle check by reg, condition photos, a damage diagram, coordinator authorisation codes, collection and delivery addresses, and a PDF of each job.
- **PlateTrack is built around the money.** It shows net profit per job, expenses and receipts, tax, MTD and payslip matching. The competitor leaves expenses out completely: its Earnings tab says "Expenses aren't included".
- **The biggest gaps** are vehicle lookup, condition photos with damage marks, a PDF for each job, reminders, a calendar, and a job lifecycle (Active → Done).
- **One gap is a bug in PlateTrack.** New jobs never become "active". Only **Reopen** sets that status (`index.html:5353`), so the **In progress** section on the v2 Jobs tab only shows reopened jobs.

## 1. What they do well that PlateTrack lacks

| Area | Competitor | PlateTrack today | Gap |
|---|---|---|---|
| **Vehicle check** | A yellow UK plate input gives live make, MOT status, tax due, year and fuel. It opens from an **MOT** pill on home. On a job, Vehicle details (make, model, VIN) fill in from the reg. | Stores the reg only, with no lookup. | Missing |
| **Condition photos** | A **Photo** button and Photos section on every job, with the photo count in the job header. | Only receipts have photos. v2 reads job screenshots but doesn't keep them. | Missing |
| **Damage diagram** | Tap a top-down car outline to mark damage that was already there. Tap a mark to change or remove it. | Free-text notes only (the "Damage found" chip). | Missing |
| **PDF per job** | **Export PDF** on the job page. | CSV for the whole account and a text Self Assessment report. Nothing per job. | Missing |
| **Job lifecycle** | A new job is Active. Home shows **Active now** and **Done** counts. | Complete and Abort buttons exist on the job page, but new jobs start with no status, so In progress is nearly always empty. | Partial (bug) |
| **Reminders** | "Things to chase, sorted by when they're due", with a nudge when one is due. A **REM** pill on home. | None. The header bell only says "No new notifications" (`openNotifications`, `index.html:2323`). | Missing |
| **Calendar** | A month grid on its own tab. Tap a day to see its jobs. | None. | Missing |
| **Jobs home** | Tiles for Active now, Done and Earned, with a tap to switch period. History chips with counts (Today, This Week, Last Week, This Month, All). A big **Start New Job** button. The header collapses to give the list more room. | In progress plus Recent jobs (25, then Show all), search, and Scan or Manual. | Partial |
| **Earnings periods** | Chips for This week, Last week, This month, Last month, This year, All time and Range. Shows jobs done, average per job, the last 8 weeks and "Where it came from". | Insights filters by tax year, company or date range, with monthly and weekly profit charts and the SA breakdown. No week or month quick chips, no job count, no average. | Partial |
| **Authorisation codes** | Coordinator name and a list of authorisation codes. The common first 6 digits are saved in Settings so you type less. | None. | Missing |
| **Quick pay** | "Vehicle inspected — turn on to add an inspection payment", plus an **Add pay** toggle. | **+ Add pay** opens the full form. Inspection pay is only recognised when matching payslips. | Partial |
| **Addresses** | Address line 1 with suggestions, line 2, town and postcode. **Scan delivery** reads just the delivery note. | Legs keep the addresses and postcodes they were scanned from. Manual entry takes postcodes, with no suggestions. | Partial |
| **Notes** | A mic button, filter chips (All, To-do, Inbox, Office, Archived), archive, notes grouped by day, and an "Unlinked" tag. | Chips, search, a done tick and auto-linking to a job by ref or plate. Notes sync when you're signed in, while theirs stay "on this device". No filters, archive, day groups or way to link a note by hand. | Partial |
| **AI** | A floating **Co-Driver** button on home with a green dot. It looks like an assistant. | There is an AI assistant, but it isn't on the tab bar. You reach it through Smart Actions. | Hard to find |
| **Templates** | Save as template. | **Copy job** (same company, pay, route and legs). | Mostly covered |
| **Search** | Reg, VIN, customer, address, make and more. | Reg, refs, postcodes and places. | Extend once vehicle and customer fields exist |
| **Customer** | A customer name on each job. | Company only. | Small |

## 2. Where PlateTrack is already ahead (keep these)
- **Net profit.** Expenses, receipt OCR and reimbursed-or-not tracking give a Net on every job. Their job header calls the driver's pay "Total Cost", and their earnings leave expenses out.
- **Tax.** A tax estimate and Tax Pot, MTD quarters with deadlines and CSV, and a countdown to the SA deadline.
- **Payslips.** Payslip OCR with automatic matching and Paid ticks. Theirs only offers "Were you paid? Check jobs against your payslips".
- **Route scanning.** Several screenshots become several legs in one go, with carryovers, abort per leg, and travel or hotel between legs.
- **Sync.** Notes and job data sync to the account.
- **Other extras.** Import from Excel, CSV or notes, CSV export, the missing-receipt nudge, and £/hr on job cards.
- **Job refs.** The reg stands in as the job ref until the company's ref arrives. Theirs shows placeholders like `AUTO-806148`.

## 3. Their mistakes to avoid
- **Their calendar is wrong.** It puts 6 days in each row under a 7-day header. Fri 6 Nov 2026 shows under Sat, Mon 30 Nov shows under Sat, and the Sunday column is always empty.
- **Stale jobs stay open.** A job dated 1 Jul 2026 still shows "In Progress" in November, with nothing prompting the driver to finish or abort it.
- **Confusing labels.** "Total Cost" means the driver's pay. Earned shows £0 while a job is active, because only completed jobs count, and the tile doesn't say so.
- **Visual clutter.** Placeholder job numbers in the list, and an empty grey square where a logo or photo should be.
- **One long form.** About ten sections to scroll through, toggles that don't clearly show on or off, and a doubled icon on "📷 📷 Scan job sheet (AI)". PlateTrack's scan-first flow is faster, so keep the new sections short and collapsible.

## 4. Plan

How the work fits the app:
- **New UI goes in v2 as separate files**, the way `v2/mtd.js` does, added to the lists in `build.js`. `index.html` stays as it is.
- **Small job data syncs with no schema change.** It lives in `DB.jobs[key]` (or `DB.notes`) and syncs through `users.job_meta`.
- **Photos go to Supabase Storage.** They must never go into `pt9`, because localStorage holds about 5 MB.
- **Every item ships with Playwright tests and a rebuilt `docs/`.**

### Phase 0: start now (no code, long lead time)
- **DVLA Vehicle Enquiry Service API key.** Gives make, colour, year, fuel, tax status and due date, and MOT status and expiry. Free; you apply for a key.
- **DVSA MOT History API.** Gives model, first-used date, each MOT test with its mileage and advisories, and the expiry. Free; it uses OAuth client credentials plus an API key.
- Approval can take a while, so apply for both before Phase 2.

### Phase 1: lifecycle, reminders, calendar (app only, no new services)

**1.1 Job lifecycle (S). Fixes the bug.**
- A job made through New job (scan or manual) that is dated today or later starts as `status:'active'`.
- Older dates and imports stay as they are now: a blank status, counted as done. Logging last week's jobs shouldn't fill In progress.
- Leave existing jobs alone.
- Complete and Abort already sit at the bottom of the job page, so nothing is needed there.
- **Stale nudge:** if an active job's collection date (or delivery date, for a carryover) is 2 or more days ago, its card asks "Still going? Complete · Abort".
- **Tests:** a new job for today shows under In progress, a past-dated one doesn't, and Complete moves it.

**1.2 Reminders and a working bell (M)**
- **A reminder is a note with a due date.** Add `due` (`YYYY-MM-DD`) and an optional `time` to `DB.notes` entries. Notes already sync, so no schema change is needed.
- **Remind me** on a note offers Today, Tomorrow or a picked date.
- **The bell becomes real.** v2 overrides `openNotifications`. Its badge counts overdue and due-today items that aren't done. Tapping it opens a "Things to chase" list sorted by due date, with Done and Snooze 1 day. The list also shows stale active jobs and expenses missing a receipt, so everything that needs attention is in one place.
- **Overview** shows a one-line banner when something is due today.
- **Flag an issue** on the job page makes a reminder linked to that job, pre-filled with "Chase: <ref> — ".
- Notifications on the phone itself come later (4.1).

**1.3 Calendar (M): `v2/calendar.js`**
- A **List | Calendar** switch on the Jobs tab, so the tab bar doesn't grow.
- **The grid:**
  - A Monday-first month grid built from local dates (`parseYMD`).
  - Each day shows a dot for each job and the day's pay.
  - Carryovers span from collection to delivery.
  - Reminders due that day show on the day.
  - So do tax deadlines: MTD quarter deadlines and 31 January.
- **Tapping a day** shows that day's job cards (`jobCardHTML`) and **+ New job** for that date. Future-dated jobs show as Upcoming.
- Arrows or a swipe change month, and **Today** jumps back.
- **Tests:** November 2026 puts the 1st under Sun and the 30th under Mon (the competitor's bug), and a carryover appears on both of its days.

**1.4 Jobs home (S–M)**
- **Three tiles** above the list: Active now, Done and Earned. Tap to switch between Today, This week and This month.
  - Earned is the pay logged, matching Overview.
  - Net shows underneath, which the competitor can't do.
- **History chips with counts** (Today, This week, Last week, This month, All) replace "Recent jobs (25) / Show all".
- **Header:** the bell becomes Reminders (1.2), and Vehicle check sits next to Notes once 2.1 exists.

**1.5 Notes tidy-up (S)**
- Filters: All, To-do, Reminders, Linked and Done.
- Group notes by day: Today, Yesterday, then the date.
- A **Link to job** picker (search by reg or ref) for notes that didn't link themselves.
- **Mic:** the iPhone keyboard's dictation already works in the notes box. Try `webkitSpeechRecognition` in the installed home-screen app before adding a button, because it can be patchy there.

### Phase 2: vehicle and condition (the competitor's main edge)

**2.1 Vehicle check (M). Needs the Phase 0 keys.**
- **Worker:**
  - Add `GET /vehicle?reg=` to `platetrack-ai-worker`. That worker already checks sign-in and origin and has a deploy Action.
  - It calls DVLA VES and DVSA MOT History at the same time and merges the results into `{reg, make, model, colour, year, fuel, taxStatus, taxDue, motStatus, motExpiry, lastMotMileage, firstUsed}`.
  - Secrets: `DVLA_API_KEY`, `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET` and `DVSA_API_KEY` (tenant and scope as vars).
  - Add a KV namespace: it caches each reg for 24 hours and enforces a daily limit per user. The same KV can hold the per-user AI limits in BACKLOG §4.
  - Add worker tests with mocked DVLA and DVSA responses.
- **App:**
  - A Vehicle check sheet with the yellow plate input, opened from the Jobs header and the job page.
  - It shows make, model and colour, MOT valid until or expired, tax, year, fuel and last MOT mileage.
- **On jobs:**
  - When a job or leg has a reg, look it up once and show e.g. "Silver Ford Focus · 2019" on the job page and card.
  - Store results in `DB.vehicles[REG]`, keyed by plate so legs share them (synced in `job_meta`).
  - Add make, model and colour to job search.
- **Why it matters:** at collection you can check it's the right car (make and colour match) and see the MOT expiry before driving.
- **Signed out:** show "Sign in to check vehicles". This keeps the keys and limits on the server. The competitor needs no account; that's a choice for you (see the questions below).

**2.2 Condition photos (L)**
- Photos are taken per job, per car (reg), at two stages: Collection and Delivery.
- A Photo button on the job page and on each leg. The counts show in the header.
- **Storage:**
  - Files go in a new private Storage bucket at `JobPhotos/{userId}/{jobKey}/{photoId}.jpg`.
  - They are compressed with `compressImage`, the same way receipts are.
  - When signed out, photos go to IndexedDB (`rsPut`) and upload at sign-in, as `supaUploadPendingReceipts` does for receipts.
  - Keep only small thumbnails on the phone.
- **Metadata:** `DB.jobs[key].photos=[{id, reg, stage, ts, path}]` (synced). Each photo keeps the time it was taken, which also goes on the PDF.
- **Access and deletes:**
  - In `supabase/rls.sql`, add the same per-user policies for `JobPhotos` as for Receipts.
  - Deleting a job deletes its photos, using the pending-delete retry that receipts use.
- **Cost:**
  - A photo is about 150–250 KB.
  - 10 photos × 500 jobs ≈ 1 GB, which is the whole Supabase free tier.
  - Decide whether photos are Pro-only or limited for free users (ties into BACKLOG §4).

**2.3 Damage diagram (M)**
- An SVG car. Start with the top view, like theirs; left, right, front and rear views can come later.
- **Marking:** tap to add a mark: Scratch, Dent, Chip, Crack, Scuff or Missing, with a note. A mark can have a photo from 2.2 attached.
- **Storage:** marks are kept per car and stage in `DB.jobs[key].damage[REG]={collection:[{x, y, view, type, note, photoId}], delivery:[…]}`. The data is small and syncs.
- **Collection vs delivery:** "Copy collection marks to delivery", and highlight any mark that's new at delivery. That's the part that protects the driver.

**2.4 Job sheet PDF (M)**
- **Export PDF** on the job page includes:
  - ref, company and dates
  - each leg: reg, vehicle, collection and delivery addresses and times, and miles
  - damage diagrams and photos with times
  - auth codes and notes
  - an optional pay summary, with a toggle to leave it out when sending the PDF to the office
- **How:** render a page styled for printing and call `window.print()`, which offers Save as PDF and share.
- Test it on an iPhone home-screen install. If printing is unreliable there, load a PDF library only when someone exports.

### Phase 3: pay and admin polish

**3.1 Quick pay (S)**
- Default amounts for each company and income type, set in Settings → Companies next to the expense defaults.
- Chips on the job page such as "+ Inspection £15" or "+ Waiting time" add that pay to the job in one tap.

**3.2 Authorisation codes (S–M)**
- A coordinator name and authorisation codes on a job and on an expense.
- Settings → Companies → code prefix (the first digits), so you only type the rest.
- Codes show on the expense row, the PDF and the CSV, and are searchable. They help when claiming reimbursed expenses.

**3.3 Insights periods (M)**
- Quick chips: This week, Last week, This month, Last month, This tax year, All and Range.
- **Tiles:**
  - jobs done and average pay per job
  - £/hour and £/mile, from the times and miles already logged, which the competitor can't show
- The last 8 weeks as bars, and a breakdown by company.

**3.4 Addresses (S)**
- Postcode suggestions and checks through postcodes.io autocomplete. The app already uses postcodes.io for miles, and it's free.
- Full street-address suggestions would need a paid service such as Ideal Postcodes or getAddress.
- **Navigate** buttons on each collection and delivery open Apple Maps, Google Maps or Waze.

**3.5 Customer field (S)**
- An optional end customer or site on a job (e.g. "Arnold Clark Leeds"). It's searchable and goes on the PDF.

### Phase 4: bigger pieces

**4.1 Reminder notifications on the phone (L)**
- Web Push for the installed app; iPhones support this for home-screen apps from iOS 16.4.
- Needs VAPID keys, a `push_subscriptions` table and a Cloudflare cron worker that sends due reminders.
- Until then, reminders are only in the app.

**4.2 Make the AI assistant visible (S)**
- Do this after the per-user AI limits in BACKLOG §4.
- A floating **Ask** button on Jobs and Overview opens the existing AI tab, with suggestions based on the open job.

**4.3 Job templates (S)**
- Name and save a regular route. Copy job already covers most of this.

## 5. Suggested order
1. Apply for the Phase 0 keys today.
2. Phase 1 in this order: 1.1 lifecycle, then 1.4 home tiles and chips, 1.2 reminders, 1.3 calendar and 1.5 notes.
3. Phase 2 in this order: 2.1 vehicle check once the keys arrive, then 2.2 photos, 2.3 damage and 2.4 PDF.
4. Phase 3 in any order. Phase 4 once charging (BACKLOG §4) is under way.

## 6. Open questions
- Which companies give you authorisation codes, and do their codes share a prefix?
- Should condition photos be Pro-only, or free up to a limit?
- Should a job logged for a past date start as Done (suggested) or as Active?
- Should vehicle check require sign-in (suggested), or be open to everyone like theirs?
