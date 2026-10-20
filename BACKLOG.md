# PlateTrack backlog

In priority order for (1) keeping drivers' data safe, (2) Making Tax Digital for Income Tax
(MTD ITSA), and (3) charging for the app. Reviewed October 2026.

## 1. Before other people rely on it
- **Custom email domain** so "Forgot password?" reaches every user: buy a domain, verify it in
  Resend, then Supabase → Authentication → Emails → SMTP (host `smtp.resend.com`, port 465,
  user `resend`, password = Resend API key). No code change needed.
- **Supabase paid plan** once others depend on it. Free projects pause after a week without
  activity and have no point-in-time backups; Pro adds daily backups and stays awake.
- **Privacy policy and terms**, linked from the sign-up screen, and the **ICO data protection fee**
  (UK GDPR). List the processors: Supabase (data), Cloudflare (AI proxy), Anthropic (receipt and
  payslip images), Plaid (bank feeds). Check the Supabase project's region.
- **Password strength**: raise Supabase's minimum password length from 6 to 8
  (Authentication → Providers → Email).

## 2. MTD-ready records (no HMRC connection yet)
MTD ITSA applies from 6 April 2026 to sole traders with qualifying income (gross turnover, not
profit) over £50,000, from April 2027 over £30,000 and from April 2028 over £20,000.
- **MTD eligibility check**: show gross self-employed income for the last full tax year against
  the threshold that applies, with the date MTD starts for that driver.
- **HMRC expense categories**: map each PlateTrack category to an SA103/MTD category (fuel, tolls,
  parking, travel → "Car, van and travel expenses"; hotels → travel; cleaning → repairs/other…).
  Drivers with turnover under £90,000 may send a single consolidated expenses figure instead.
- **Quarterly summaries**: standard quarters (6 Apr–5 Jul, 6 Jul–5 Oct, 6 Oct–5 Jan, 6 Jan–5 Apr)
  and the calendar-quarter option, cumulative year-to-date, with the deadline (7 Aug, 7 Nov,
  7 Feb, 7 May) and a countdown on the dashboard.
- **Export** of those figures for an accountant or bridging software.

## 3. MTD-compatible software (submitting to HMRC)
- Register on the **HMRC Developer Hub** and build against the sandbox: OAuth 2.0 with Government
  Gateway, the Business Details, Obligations, Self-Employment Business (cumulative period
  summaries), Individual Calculations and final declaration APIs.
- **Fraud prevention headers** are mandatory (connection method WEB_APP_VIA_SERVER: the HMRC calls
  go through a server, e.g. a new Cloudflare Worker that also keeps each user's HMRC tokens).
- Apply for **production credentials** (HMRC reviews a demo and checklists) and get listed on
  HMRC's recognised software list. Plan for this to take weeks.

## 4. Charging for the app
- **Payments**: Stripe Checkout subscriptions for the web app (the paywall's £4.99/month plan),
  with a webhook that records entitlement in Supabase.
- **Server-side Pro status**: replace the `pt_pro` localStorage flag; check entitlement in the
  app and in the AI worker.
- **Per-user AI limits** in the AI worker (e.g. Cloudflare KV counter per user per day), so one
  account can't run up the Anthropic bill.
- **Bank feeds**: the Plaid worker runs in `sandbox` (test banks only). Real UK bank feeds need
  production approval from Plaid or another open-banking provider.
- Landing page on the new domain; optional App Store version later (native wrapper; Apple takes a
  cut of subscriptions).

## Smaller ideas
- **Missing-receipt reminders** for expenses over a set amount without a photo.
- **Weekly summary notification**: earnings, expenses and tax to set aside.
- **Delete receipt photos from storage** when their expense is deleted (they are currently left
  behind in the Receipts bucket).
- **Split `index.html` into modules** gradually, now that `npm test` covers the main flows.
