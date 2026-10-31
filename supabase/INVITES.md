# Inviting testers

PlateTrack is invite-only while it's being tested. Only emails on your invite list can create an
account; anyone else sees "This email hasn't been invited to test PlateTrack yet". People who already
have an account keep working.

## 1. Turn it on (once)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. In the left menu, open **SQL Editor** and click **New query**.
3. Copy everything in [`invites.sql`](invites.sql), paste it in, and click **Run**.
   It should say *Success. No rows returned*. Running it again is safe.
4. Check who already has an account: **Authentication → Users**. Anyone you don't know can be deleted
   there (the **⋯** menu on their row → **Delete user**).

## 2. Invite someone

Either way works:

- **Table Editor** (no typing SQL): left menu **Table Editor** → table **tester_invites** →
  **Insert → Insert row** → type their email (and a note, e.g. "Sam, BCA driver") → **Save**.
- **SQL Editor:**
  ```sql
  insert into public.tester_invites (email, note) values ('sam@example.com', 'Sam, BCA driver');
  ```

Capital letters and stray spaces in the email don't matter.

Then send them:
- the app link: `https://tyburtonc-stack.github.io/Plate-Track/v2/` (or `/Plate-Track/` for the current app)
- a note to tap **Sign up free**, use **the same email you invited**, choose a password, and tick
  **I agree to the tester terms**.

## 3. Check it works

On your phone, open the app signed out and try to sign up with an email that is **not** on the list.
You should see *"This email hasn't been invited to test PlateTrack yet"*. Then add that email to the
list and try again: it should create the account.

## Other things you can do

| To… | Do this |
|---|---|
| See the invite list | `select * from public.tester_invites order by invited_at;` |
| Cancel an invite that hasn't been used | `delete from public.tester_invites where email = 'sam@example.com';` |
| Remove a tester's access | **Authentication → Users** → their row → **⋯** → **Delete user**. Also delete their invite, or they can sign up again. |
| Open sign-up to everyone | `drop trigger if exists pt_require_invite on auth.users;` and set `INVITE_ONLY = false` in `index.html` |

## Notes

- The list can't be read or changed by the app or by anyone using the public app key (Row Level
  Security is on with no policies). Only you, in the Supabase dashboard, can see it.
- **Email confirmation:** if **Authentication → Sign In / Providers → Email → Confirm email** is on,
  Supabase emails each new tester a link before they can sign in. Supabase's built-in email only
  delivers to a few addresses without your own email service (see "Custom email domain" in
  `BACKLOG.md`), so while testing it's simplest to leave **Confirm email** off: the invite list
  already decides who can join.
- The tester terms live in `TESTER_TERMS` in `index.html`. If you change them, raise
  `TESTER_TERMS_VERSION` and everyone is asked to agree to the new version next time they open the app.
