# Airwave Control (Android widget)

A minimal native Android home-screen widget for controlling an Airwave server.
Player controls only — no library browsing, no voice.

## Controls

- Tap the device name to cycle through enabled devices.
- Volume down / volume up (5% steps).
- Play / pause (toggles based on current state).
- Next track.

## Configuration

Launch the app once and set the Airwave server URL (for example the LAN URL of
your TrueNAS host, `http://192.168.66.3:7880`). The widget calls the same
`/api` endpoints the web UI uses, so point it at a reachable Airwave instance.

If using a public Airwave API endpoint, enter its API bearer token in the token
field. The Cognito-protected web UI host is not suitable for widgets because
Android AppWidgets cannot complete the interactive browser login flow.

## Build

```bash
cd android
gradle assembleDebug      # or assembleRelease with signing env vars
```

Release signing reads `ANDROID_SIGNING_STORE_FILE`,
`ANDROID_SIGNING_STORE_PASSWORD`, `ANDROID_SIGNING_KEY_ALIAS`, and
`ANDROID_SIGNING_KEY_PASSWORD` from the environment (used by CI). Without them,
`assembleRelease` produces an unsigned APK.

## Distribution

CI publishes signed releases to the shared Ahara F-Droid repository. Add
`https://fdroid.services.ahara.io/repo` in the F-Droid client.
