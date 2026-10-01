# Local welcome and sign-in

Implemented 8 September 2026 after Dan approved a login-free Demo path and private owner sign-in on the same app. This replaces the developer-script-only entry flow.

## Daily use

Start the host with `./scripts/Start-Backend.ps1 -Https`, then open https://localhost:5443.

- **Try Demo** opens the existing fictional workspace immediately. Its budgets, goals and edits persist in the separate Demo database. It is shared local demo data, not a new dataset per visitor.
- **Sign in as Dan** accepts the local Banking password and opens Dan's workspace. This is independent of Google, Azure, Enable Banking and MitID credentials.
- The bottom account row opens Settings, Connections and Sign out. Sign out returns to the welcome screen to choose Try Demo or Sign in as Dan. Settings → Profile also provides Sign out and owner sign-in/setup. Entering public Demo from the welcome page revokes the previous session.
- Sessions last at most eight hours and expire when the server restarts. Signing out revokes the server session, including replay of its old cookie. Language and theme stay in localStorage; only the chosen workspace name goes in sessionStorage.

## First-time owner setup

Dan must enter his own password; never generate one or send it through chat. Run `./scripts/Open-Banking.ps1 -SetupPassword` to open a trusted one-time setup link in Chrome, or deliver its `-NoOpen` result privately to the intended local browser. Settings → Profile → Set your local password is also available in a trusted owner session.

Choose and confirm 8–128 characters. The setup endpoint refuses anonymous/Demo callers and refuses replacing an existing password. Setup revokes previous owner sessions and issues a new session to the current browser. Normal sign-in then requires no script.

The existing owner launch script remains a local recovery access mechanism protected by the Windows user's DPAPI token. Password change/reset UI is not included in this iteration; do not delete the credential file as an automatic recovery action.

## Access boundary

Demo and Owner roles are enforced on the server before resolving the workspace. A Demo cookie cannot request Live via a forged header, configure an owner password, or mint an owner launch ticket. Bank callback routes retain their original state/consent validation; they do not log users in. Loopback restrictions remain in effect. Public Demo means no login on the local site, not an internet deployment.

The password uses [ASP.NET Core Identity PasswordHasher](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.passwordhasheroptions?view=aspnetcore-10.0), configured for 210,000 PBKDF2 iterations. Its salted hash is additionally protected with the DPAPI-backed Data Protection key ring in the restricted local Banking directory. Only a protected hash is persisted; passwords are never logged or placed in browser storage. Testing hosts use an in-memory credential store and cannot overwrite Dan's credential.

Five failed attempts in a 15-minute window block further sign-in attempts for the rest of that window. This is an in-memory local throttle, reset on host restart. Cookies are random 256-bit capabilities with hashed server-side lookup, HttpOnly, Secure, SameSite=Strict and host-only. Same-origin HTTPS and the custom browser header protect browser mutations. No cloud identity registration, network exposure or deployment was performed.

## Verification

- 56 backend tests passed, including new anonymous/Demo isolation, owner-only setup, password validation, sign-in throttling, logout replay rejection and session replacement.
- 33 real Chrome workflow checks passed, including welcome at 1440px/390px, Demo entry, forbidden Live requests, first setup, mismatched confirmation, sign-out, wrong password, successful sign-in, refresh persistence, and the existing accounts/review/budgets/goals/settings flows. No browser script errors.
- All automated credentials, budget/goal writes and other mutations used disposable test hosts/databases. Dan's first password remains an owner action.
- Screenshots and check results: `artifacts/ui-review/welcome-desktop.png`, `welcome-mobile.png`, `sign-in-desktop.png`, and `verification.json`.

Remote phone rendering and owner acceptance remain separate from these local Chrome checks. Production identity and deployment require a later approved design.
