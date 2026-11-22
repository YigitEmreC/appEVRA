# Evra accounts

Who may sign in to the Evra app, and who may use the **Evra assistant**.

**Two places, one API:**
- **The Evra website (the default):** `https://evrasmarthome.com/api/accounts`.
  - Members use their website account: e-mail address and password, made with **Üye ol** on the site.
  - The assistant comes with the **Premium** plan, and an app admin can switch it on or off for anyone.
  - The code is `lib/accounts.js` in the webEVRA repository, on the website's own `users` and `sessions` tables in Cloudflare D1. Its setup is in the webEVRA README, step 7.
- **The stand-in on this computer:** `server.py` in this folder, `http://localhost:8770/api`.
  - It has its own members with usernames, made by its admin.
  - It's for working on the app without the website.

Both answer the same requests, so switching only changes an address:
- **The app:** Settings → developer mode on → Evra account → **Evra accounts address**, with the buttons **Evra website** and **This computer**.
- **The assistant:** `ACCOUNTS_URL` in `EvrAI/gemini_home_starter/.env`. It must match the app's address, because a sign-in only exists on the server that made it.

**What the app does:** a member without the assistant doesn't see the Assistant tab. If they open it anyway, it says why.

**What the assistant server does:** it checks every request with the accounts service's `/me`, so hiding the tab isn't the protection. With no sign-in it answers 401, and without access it answers 403.

**When changes take effect:**
- Switching the assistant on works immediately.
- Switching it off, or switching someone's access off, takes effect within 30 seconds, because the assistant briefly reuses an "allowed" check.

## Differences between the two

| | Evra website | This computer |
|---|---|---|
| Sign in with | e-mail address | username |
| New members | sign up on the website | the admin adds them in the app |
| Assistant | Premium plan, or an admin's choice | an admin's choice |
| Admins | the first is made in the D1 Console, the rest in the app | the first account, the rest in the app |
| Names, password resets, deleting | on the website | in the app (Manage members) |
| "Off" switch | app access only; the website account stays | the whole account; signed out everywhere |
| Wrong passwords | 5 lock the account for 15 minutes (the website's lock) | 5 in 5 minutes, per username or address, make sign-in wait |

**Both:**
- Passwords are PBKDF2-SHA256 with 100,000 iterations and a random salt.
- Session tokens are stored only as SHA-256 hashes and last 30 days.
- The only admin can't be demoted or switched off.

## Use the stand-in

1. **Start it:** `Start Evra.bat` starts it. By hand, from the `SMART` folder: `python appEVRA/tools/accounts/server.py` (port 8770; `--port`, `--data` and `--origin` change it).
2. **Point the app and the assistant at it** (see above).
3. **Create the admin account** in Evra under **Settings → Evra account**. The first account becomes the admin.
4. **Add members:** **Manage members** → add a member with a temporary password, and tick **Can use the assistant** for those who may use it.

**Data:** `data/accounts.json`, which git ignores. Deleting it starts over with first-time setup.

**First-time setup:** setup is open to whoever gets there first. That's fine here, because only the app at `http://localhost:8010` may call the service.

## API

Paths are relative to the base address above. All endpoints take and return JSON. "Token" means `Authorization: Bearer <token>`.

| Method and path | Who | Does |
|---|---|---|
| `GET /status` | anyone | `{ready, features, roles}`, plus `kind: "website"`, `signupUrl`, `forgotUrl` and `accountUrl` on the website |
| `POST /setup` | stand-in only, while it has no accounts | `{name, username, password}` → `{token, user}`, an admin |
| `POST /login` | anyone | `{username, password}` → `{token, user}`; on the website the username is the e-mail address |
| `POST /logout` | token | ends that session |
| `GET /me` | token | the member: `{id, username, name, role, features: {ai}, disabled, created, last_login}`. On the website also `email`, `plan`, `planName`, `aiFrom` and `aiOverride` |
| `POST /me/password` | token | `{current, new}`; signs out your other sessions |
| `GET /members` | admin | all members (`kind: "website"` on the website) |
| `POST /members` | admin, stand-in only | `{name, username, password, role, features}` |
| `PATCH /members/{id}` | admin | any of `{role, features, disabled}`. On the website `features.ai: null` means "follow the plan". On the stand-in also `{name, password}` |
| `DELETE /members/{id}` | admin, stand-in only | deletes the account |

Errors come back as `{"error": "plain message"}` with a fitting status code.
