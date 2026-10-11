/**
 * SmartThings Webhook Relay
 *
 * Receives device events from SmartThings and forwards them to external webhooks
 * after applying custom transformation and routing logic.
 *
 * When a SmartThings device event fires, it is passed to handleEvent(), where you
 * decide how to transform it and which webhook URL to call. All other code is
 * plumbing that you do not need to touch.
 *
 * ============================================================
 * SETUP PROCEDURE
 * ============================================================
 *
 * 1. CREATE A SMARTTHINGS PERSONAL ACCESS TOKEN (PAT)
 *    - Go to https://account.smartthings.com/tokens
 *    - Create a new token with at least these scopes:
 *        r:devices:*        (read devices)
 *        r:locations:*      (read locations — only needed if device_ids is not set)
 *        l:installedapps    (list installed apps)
 *        w:installedapps    (install/manage apps)
 *    - Copy the token immediately (it is only shown once)
 *
 * 2. SET SCRIPT PROPERTIES
 *    In the Apps Script editor: Project Settings > Script Properties > Add:
 *
 *    pat_token    — the PAT from step 1
 *    device_ids   — comma-separated SmartThings device IDs to subscribe to,
 *                   e.g. "aaa-111, bbb-222". Leave empty to subscribe to ALL
 *                   devices in the location.
 *    location_id  — (optional) your SmartThings location ID. If omitted and
 *                   device_ids is also empty, the first location in your account
 *                   is used automatically and this property is populated.
 *
 *    The following are set automatically — do not add them manually:
 *    app_id            — written by setup()
 *    installed_app_id  — written on INSTALL/UPDATE lifecycle or by install()
 *
 * 3. EDIT handleEvent()
 *    Fill in your transformation and routing logic in the EVENT HANDLING section
 *    below. Each if-branch should build a payload and call callWebhook(url, payload).
 *
 * 4. DEPLOY AS WEB APP
 *    In the Apps Script editor:
 *    Deploy > New deployment > Web app
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the deployment URL.
 *
 * 5. RUN setup()
 *    In the Apps Script editor, select setup() from the function dropdown and
 *    click Run. This registers the WebHook Smart App with SmartThings, pointing
 *    it at your deployment URL. Check the logs (View > Logs) for confirmation.
 *    SmartThings will immediately send a confirmation GET request to your URL,
 *    which doGet() handles automatically.
 *
 * 6. INSTALL THE APP
 *    Either:
 *    a) Run install() from the script editor (no mobile app needed), OR
 *    b) Open the SmartThings mobile app > Menu > SmartApps > Add SmartApp >
 *       My Apps (requires developer mode enabled on your account)
 *
 *    Both trigger the INSTALL lifecycle, which subscribes to your devices.
 *
 * 7. TEST
 *    Trigger an event on one of your devices (e.g. toggle a switch). Check
 *    Apps Script logs (View > Logs) to confirm the event was received and routed.
 *
 * NOTE: If you redeploy the GAS (new deployment URL), re-run setup() to update
 * the webhook URL registered with SmartThings, then re-run install().
 * ============================================================
 */

// ============================================================
// SCRIPT PROPERTIES (set via Project Settings > Script Properties)
// ============================================================
// pat_token         — your SmartThings Personal Access Token
// device_ids        — comma-separated device IDs, or leave empty for ALL devices
// location_id       — your ST location ID (auto-resolved and cached if not set)
// app_id            — set automatically by setup()
// installed_app_id  — set automatically on INSTALL/UPDATE or by install()
// ============================================================

function getProps() {
  return PropertiesService.getScriptProperties();
}

function getProp(key) {
  return getProps().getProperty(key) || "";
}

// ============================================================
// EVENT HANDLING — edit this section to add your logic
// ============================================================

function handleEvent(event) {
  const { deviceId, capability, attribute, value } = event.deviceEvent;

  // Example: switch turned on
  if (capability === "switch" && attribute === "switch" && value === "on") {
    const payload = {
      deviceId: deviceId,
      event: "switch.on",
      timestamp: new Date().toISOString(),
    };
    callWebhook("YOUR_WEBHOOK_URL", payload);
    return;
  }

  // Example: switch turned off
  if (capability === "switch" && attribute === "switch" && value === "off") {
    const payload = {
      deviceId: deviceId,
      event: "switch.off",
      timestamp: new Date().toISOString(),
    };
    callWebhook("YOUR_WEBHOOK_URL", payload);
    return;
  }

  // Unhandled events — log and drop
  Logger.log("Unhandled event: " + JSON.stringify(event.deviceEvent));
}

// ============================================================
// SMARTTHINGS WEBHOOK HANDLERS — do not edit below this line
// ============================================================

function doGet(e) {
  const confirmationUrl = e.parameter.confirmationURL;
  if (confirmationUrl) {
    UrlFetchApp.fetch(confirmationUrl, { method: "get", muteHttpExceptions: true });
    return ContentService.createTextOutput("Confirmed").setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput("SmartThings Webhook").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const lifecycle = body.lifecycle;

    if (lifecycle === "PING") {
      return jsonResponse({ pingData: { challenge: body.pingData.challenge } });
    }

    if (lifecycle === "CONFIGURATION") {
      return handleConfiguration(body);
    }

    if (lifecycle === "INSTALL" || lifecycle === "UPDATE") {
      const data = body.installData || body.updateData;
      getProps().setProperty("installed_app_id", data.installedApp.installedAppId);
      subscribeToDevices(data.authToken, data.installedApp.installedAppId);
      return jsonResponse({ installData: {} });
    }

    if (lifecycle === "UNINSTALL") {
      return jsonResponse({ uninstallData: {} });
    }

    if (lifecycle === "EVENT") {
      const events = body.eventData.events || [];
      events.forEach(event => {
        if (event.eventType === "DEVICE_EVENT") {
          handleEvent(event);
        }
      });
      return jsonResponse({ eventData: {} });
    }

    return jsonResponse({});

  } catch (err) {
    Logger.log("doPost error: " + err);
    return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleConfiguration(body) {
  const phase = body.configurationData.phase;

  if (phase === "INITIALIZE") {
    return jsonResponse({
      configurationData: {
        initialize: {
          name: "ST Webhook Relay",
          description: "Relays SmartThings device events to a webhook",
          id: "st-webhook-relay",
          permissions: ["r:devices:*"],
          firstPageId: "1",
        }
      }
    });
  }

  if (phase === "PAGE") {
    return jsonResponse({
      configurationData: {
        page: {
          pageId: "1",
          name: "Configuration",
          complete: true,
          sections: [{
            name: "Devices",
            settings: [{
              id: "selectedDevices",
              name: "Devices to monitor",
              description: "Select devices to receive events from",
              type: "DEVICE",
              required: false,
              multiple: true,
              capabilities: [],
              permissions: ["r"],
            }]
          }]
        }
      }
    });
  }
}

function subscribeToDevices(authToken, installedAppId) {
  const deviceIds = getProp("device_ids")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (deviceIds.length > 0) {
    deviceIds.forEach(deviceId => {
      createSubscription(authToken, installedAppId, {
        sourceType: "DEVICE",
        device: {
          deviceId: deviceId,
          componentId: "*",
          capability: "*",
          attribute: "*",
          stateChangeOnly: true,
          subscriptionName: "sub_" + deviceId.replace(/-/g, ""),
        }
      });
    });
  } else {
    const locationId = resolveLocationId(authToken);
    createSubscription(authToken, installedAppId, {
      sourceType: "CAPABILITY",
      capability: {
        locationId: locationId,
        capability: "*",
        attribute: "*",
        stateChangeOnly: true,
        subscriptionName: "sub_all_devices",
      }
    });
  }
}

function resolveLocationId(authToken) {
  const stored = getProp("location_id");
  if (stored) return stored;

  const response = UrlFetchApp.fetch("https://api.smartthings.com/v1/locations", {
    method: "get",
    headers: { "Authorization": "Bearer " + authToken },
    muteHttpExceptions: true,
  });
  const locations = JSON.parse(response.getContentText()).items || [];
  if (locations.length === 0) throw new Error("No locations found in SmartThings account");

  const locationId = locations[0].locationId;
  getProps().setProperty("location_id", locationId);
  Logger.log("location_id resolved and cached: " + locationId);
  return locationId;
}

function createSubscription(authToken, installedAppId, subscriptionBody) {
  const url = `https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions`;
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Authorization": "Bearer " + authToken,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(subscriptionBody),
    muteHttpExceptions: true,
  });
  Logger.log("createSubscription: " + response.getContentText());
}

function setup() {
  const scriptUrl = ScriptApp.getService().getUrl();
  Logger.log("GAS URL: " + scriptUrl);

  const response = UrlFetchApp.fetch("https://api.smartthings.com/v1/apps", {
    method: "post",
    headers: {
      "Authorization": "Bearer " + getProp("pat_token"),
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      appName: "st-webhook-relay",
      displayName: "ST Webhook Relay",
      description: "Relays device events to a webhook",
      appType: "WEBHOOK_SMART_APP",
      webhookSmartApp: { targetUrl: scriptUrl },
      classifications: ["AUTOMATION"],
    }),
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  Logger.log("Registration result: " + JSON.stringify(result, null, 2));

  if (result.app && result.app.appId) {
    getProps().setProperty("app_id", result.app.appId);
    Logger.log("app_id saved: " + result.app.appId);
  }
}

function install() {
  const authToken = getProp("pat_token");

  const locationId = resolveLocationId(authToken);

  const appId = getProp("app_id");
  if (!appId) throw new Error("app_id not set — run setup() first");

  const response = UrlFetchApp.fetch("https://api.smartthings.com/v1/installedapps", {
    method: "post",
    headers: {
      "Authorization": "Bearer " + authToken,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      appId: appId,
      locationId: locationId,
      properties: {},
      displayName: "ST Webhook Relay",
    }),
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  Logger.log("Install result: " + JSON.stringify(result, null, 2));

  if (result.installedApp && result.installedApp.installedAppId) {
    getProps().setProperty("installed_app_id", result.installedApp.installedAppId);
    Logger.log("installed_app_id saved: " + result.installedApp.installedAppId);
  }
}

function callWebhook(url, payload) {
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
