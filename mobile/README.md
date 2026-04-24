# SportsCal Mobile

Expo-based iOS/Android app. Shares the existing SportsCal backend.

## Current scope (Phase 1)

- Login with existing SportsCal credentials (token kept in iOS Keychain)
- Calendar view (upcoming events, grouped by day, pull-to-refresh)
- Settings tab (user info + logout)

## Coming next

- Event detail screen
- Ride coordination (assign pickup/dropoff to contacts)
- Push notifications
- App Store submission

## First-time setup

```bash
cd mobile
npm install

# Install the Expo Go app on your phone from the App Store
# (free — we use it to run the app without Xcode during development)

# Start the dev server
npx expo start
```

A QR code will appear in the terminal. **Scan it with your iPhone camera** — Expo Go will open and load the app. Your phone and Mac must be on the same WiFi.

Any code change auto-reloads on the phone within a second or two.

## Project layout

```
mobile/
├── app/                  # Expo Router: filename = route
│   ├── _layout.jsx       # root layout + auth gate
│   ├── index.jsx         # initial blank screen while auth resolves
│   ├── login.jsx         # login screen
│   └── (tabs)/           # tab bar group (authenticated)
│       ├── _layout.jsx   # tabs config
│       ├── index.jsx     # Calendar tab (home)
│       └── settings.jsx  # Settings tab
├── lib/
│   ├── api.js            # fetch wrapper with base URL + auth token
│   └── auth.js           # AuthContext / useAuth / SecureStore bindings
├── components/
│   └── EventCard.jsx     # event list item
├── app.json              # Expo config (app name, bundle id, API URL)
├── package.json
└── README.md
```

## Backend URL

Configured in `app.json` under `expo.extra.apiUrl`. Currently points at
production. For local backend testing, change it to your machine's LAN IP
(e.g. `http://192.168.1.50:3000`) — **not** `localhost` (which means the phone,
not your Mac).

## Eventually: building for App Store

Requires an Apple Developer account ($99/year). When we're ready:

```bash
npx expo install eas-cli
eas build --platform ios
eas submit --platform ios
```

EAS Build runs on Expo's servers — no Xcode archive dance required.
