# home-relay

A Google Apps Script that receives SmartThings device events and forwards them to external webhooks after applying custom transformation and routing logic.

## How it works

1. SmartThings sends device events (e.g. a switch turned on) to the GAS web app endpoint
2. The GAS dispatches each event to `handleEvent()`, where you define what to do with it
3. `handleEvent()` transforms the event and calls one or more target webhook URLs

## Files

- `SmartthingsApp.js` — the full GAS source, paste into a new Apps Script project

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
