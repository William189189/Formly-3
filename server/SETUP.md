# Formly server setup (Supabase)

This turns on accounts: **sign-up with email + Telegram, 3 free forms, Formly Pro waitlist, block anyone, and your traction numbers**.
About 15 minutes. You only do this once.

---

## Step 1: Create the database (2 min)

1. In Supabase, open your **formly** project.
2. Left menu → **SQL Editor** → **New query**.
3. Open `server/supabase/1-setup-database.sql`, copy **everything**, and paste it in.
4. Click **Run**. You should see "Success. No rows returned".
5. Left menu → **Table Editor**. You should now see `users`, `events`, `traction` and `signups_per_week`.

## Step 2: Create the server function (5 min)

1. Left menu → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. **Function name:** `formly` (exactly this, small letters).
3. Delete the example code. Open `server/supabase/formly-function.ts`, copy **everything**, and paste it in.
4. Click **Deploy function**.
5. **Turn off JWT verification.** Formly uses its own sign-in tokens, so Supabase's check must be off:
   - Open the `formly` function → **Details** (or **Settings**).
   - Find **"Enforce JWT verification"** / **"Verify JWT"** and switch it **OFF**. Then **Save**.

## Step 3: Add your AI key, safely on the server (2 min)

1. Left menu → **Edge Functions** → **Secrets** (sometimes under *Manage secrets*).
2. Add these (Name → Value):

| Name | Value | Needed? |
|---|---|---|
| `AI_API_KEY` | your apiyi key (`sk-...`). **Make a NEW key for this.** | ✅ Yes |
| `AI_MODEL` | `gpt-4o-mini` | optional (this is the default) |
| `FREE_FORMS` | `3` (use `0` for unlimited during a beta) | optional (default 3) |
| `DAILY_AI_CAP` | `40` (max AI uses per person per day, protects your bill) | optional |
| `PRO_PRICE` | `S$1.99/month` | optional |

3. Click **Save**. (You can change these any time. No code changes needed.)

## Step 4: Point the extension at your server (1 min)

1. In Supabase: **Project Settings** → **General** → copy your **Project ID** (looks like `abcdxyzqwerty`).
2. Open `client/config.js` and replace `YOUR-PROJECT-ID` with it:
   ```js
   const FORMLY_SERVER = 'https://abcdxyzqwerty.supabase.co/functions/v1/formly';
   ```
3. Save, then go to `chrome://extensions` and click 🔄 on Formly.

## Step 5: Test it

1. Click the Formly icon → **Create free account**.
2. Enter your email and Telegram username, tick the box, and click **Create my account**.
3. Open a Google Form and press **✨ Fill with Formly**. The message should say *"2 free forms left"*.
4. In Supabase → **Table Editor** → `users`: your row is there 🎉

---

## Everyday use

### 📈 See your traction numbers
**Table Editor** → **`traction`**. One row shows:
- `total_signups`: everyone who created an account
- `users_who_filled_a_form`: people who actually used it
- `active_last_7_days`: people who used it this week
- `forms_filled`: total forms filled (same form twice counts once)
- `used_all_free_forms`: people who hit the free limit
- `want_pro`: people who clicked "Notify me" for Formly Pro

**Table Editor** → **`signups_per_week`** gives you numbers for a growth chart.

### ⏸️ Block someone
**Table Editor** → `users` → find the person → change **status** to `blocked` → Save.
Formly stops working for them immediately. Change it back to `active` to unblock.

### ✨ Give someone unlimited forms (friends, judges, testers)
Change their **status** to `pro`.

### 📣 Contact people for Formly Pro
**Table Editor** → `users` → filter `wants_pro` = `true`. You have their email and Telegram.

---

## What's stored where
- **Supabase:** email, Telegram, a scrambled sign-in token, plan/status, usage counts, and scrambled codes of form addresses (to know "same form vs new form").
- **User's computer only:** profile, documents, learned facts.
- **Never stored:** form questions, answers, or profile text. They pass through the server to the AI and are thrown away.
