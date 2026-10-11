# home-relay

A Google Apps Script that receives SmartThings device events and forwards them to external webhooks after applying custom transformation and routing logic.

## How it works

1. SmartThings sends device events (e.g. a switch turned on) to the GAS web app endpoint
2. The GAS dispatches each event to `handleEvent()`, where you define what to do with it
3. `handleEvent()` transforms the event and calls one or more target webhook URLs

## Setup

See the detailed procedure at the top of `SmartthingsApp.js`. In summary:

1. Create a SmartThings Personal Access Token at https://account.smartthings.com/tokens
2. Set script properties (`pat_token`, `device_ids`, optionally `location_id`)
3. Edit `handleEvent()` with your transformation and routing logic
4. Deploy as a Web App (execute as: Me, access: Anyone)
5. Run `setup()` to register the app with SmartThings
6. Run `install()` to install the app and activate device subscriptions

## Script properties

| Property | Required | Description |
|---|---|---|
| `pat_token` | Yes | SmartThings Personal Access Token |
| `device_ids` | No | Comma-separated device IDs to monitor. Leave empty for all devices in the location. |
| `location_id` | No | SmartThings location ID. Auto-resolved and cached if not set. |
| `app_id` | Auto | Set by `setup()` |
| `installed_app_id` | Auto | Set by `install()` or on INSTALL lifecycle |

## Customisation

All logic lives in the `handleEvent()` function in `SmartthingsApp.js`, clearly delimited from the plumbing code. Edit only that section to add, change, or remove event handlers.

## Notes

- SmartThings PATs do not expire — no token renewal needed
- If subscriptions are lost (e.g. after an uninstall), re-run `install()`
- After redeploying the GAS (new URL), re-run `setup()` then `install()`

## Deployment with clasp & GitHub Actions

This project is managed with [clasp](https://github.com/google/clasp) and synced to
Google Apps Script via GitHub Actions, so you no longer copy-paste the code by hand.

### Project layout

```
code/
  SmartthingsApp.js   — the GAS source
  appsscript.json     — Apps Script manifest (runtime, OAuth scopes, web app access)
.clasp.json           — binds code/ to the target GAS script ID
.github/workflows/
  deploy.yml          — push to Apps Script on push to main (and manual trigger)
  pull.yml            — manual sync FROM Apps Script back into the repo
```

### Local development

```bash
clasp login                 # one-time, creates ~/.clasprc.json
clasp push                  # upload code/ to Apps Script
clasp pull                  # download the current Apps Script version
clasp status                # show which files would be pushed
```

### CI/CD

- **deploy.yml** runs on every push to `main` (or manually) and runs `clasp push --force`,
  uploading `code/` to the bound script.
- **pull.yml** is a manual trigger that pulls the live Apps Script code back into the repo
  and commits it — useful if someone edited the script directly in the browser editor.

Both workflows authenticate using a GitHub secret:

| Secret | Description |
|---|---|
| `CLASPRC_JSON` | Contents of your local `~/.clasprc.json` after `clasp login` |

### Important: push ≠ redeploy

`clasp push` (and the deploy workflow) updates the project **files** only. It does **not**
redeploy the web app — the live `/exec` URL keeps serving the previously deployed version
until you redeploy manually:

> Apps Script editor → Deploy → Manage deployments → edit the deployment → set
> **Version: New version** → Deploy

Do this after any change that affects runtime behavior (e.g. `handleEvent()` logic), or
SmartThings will keep hitting the old code.

### Note on CI auth expiry

`CLASPRC_JSON` holds user OAuth credentials, which can expire. If the deploy workflow
starts failing on authentication, refresh it: run `clasp login` locally again, then copy
the new contents of `~/.clasprc.json` into the `CLASPRC_JSON` GitHub secret.
