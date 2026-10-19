# PlateTrack backlog

Ideas agreed for later, from the October 2026 review. Highest value first.

## Next up
- **Upgrade the AI model for scanning.** The AI worker (`platetrack-ai-worker/index.js`, `MODEL`) still uses `claude-sonnet-4-5`. A current model should misread payslips and receipts less often. One-line change in the worker, then redeploy (the GitHub Action does it on merge).
- **Making Tax Digital quarterly summaries.** MTD for Income Tax applies to sole traders over £50k income from April 2026 and over £30k from April 2027. Add a quarterly view (6 Apr–5 Jul, 6 Jul–5 Oct, 6 Oct–5 Jan, 6 Jan–5 Apr) with income and expenses mapped to HMRC categories, and an export an accountant or MTD bridging software can use.

## If the app is sold to other drivers
- **Server-side Pro status.** Pro is currently a `pt_pro` flag in localStorage that anyone can set. Store entitlement in Supabase and check it server-side (including in the AI worker).
- **Per-user AI usage limits** in the AI worker (e.g. Cloudflare KV counter per user per day).

## Smaller ideas
- **Missing-receipt reminders.** Nudge when an expense over a set amount has no photo.
- **Weekly summary notification.** Earnings, expenses and tax to set aside for the week.
- **Split `index.html` into modules** gradually, now that `npm test` covers the main flows.
