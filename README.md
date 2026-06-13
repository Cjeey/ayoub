# ⚽ Koora Test — كورة تيست

**MVP تجريبي** لتطبيق موبايل كيحاكي تجربة مشاهدة كأس العالم — **للاختبار فقط**.

A legal **test-only MVP** mobile app that simulates a World Cup streaming
experience. There are **no real match streams** in this app and none should be
added without broadcast rights: all fixtures are mock data and the player only
plays a small bundled demo video. The player accepts any standard video
source, so a rights holder could later point it at a licensed stream.

## Features — المميزات

- 🏠 **Home screen** — next match hero card + upcoming mock matches (الماتشات الجاية)
- 📅 **Match list grouped by date** — اليوم / غدا / Arabic date headers, pull-to-refresh
- 📋 **Match detail screen** — teams, group, stadium, city, kickoff time
- ▶️ **Video player** — `expo-av` playing a **local bundled demo video** (`assets/video/demo-match.mp4`)
- 🔓 **"∗6 test mode"** — two ways to unlock the demo content:
  - tap the `∗6` button on the Home screen **6 times** (one tap turns it off again), or
  - type the literal code **`*6`** in the admin settings code box.
  Either way it only flips a local AsyncStorage flag.
- ⚙️ **Admin settings** — a screen where you configure a **licensed stream provider**
  (provider name, stream URL, access token, notes). This is where you paste whatever
  beIN SPORTS gives you once you have a broadcast agreement. When a stream is configured,
  the player uses it instead of the demo clip; until then the app stays demo-only.
- 📦 **Offline support** — fixtures are seeded into AsyncStorage on first launch and read from
  there afterwards, so the app works with no network
- 🇲🇦 **Arabic / Darija-friendly UI** — all strings in `src/i18n/strings.ts`, RTL-aware layout
- 🎨 **Football-themed design** — dark pitch-green theme with gold accents

## Tech stack

| | |
|---|---|
| Framework | React Native + Expo (SDK 52) |
| Language | TypeScript (strict) |
| Video | `expo-av` |
| Offline storage | `@react-native-async-storage/async-storage` |
| Navigation | React Navigation (native stack) |

## Setup — التثبيت

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npx expo start

# 3. Open the app
#    - Scan the QR code with Expo Go (Android/iOS), or
#    - press "a" for an Android emulator / "i" for an iOS simulator
```

Type-check without running:

```bash
npm run typecheck
```

## How to test the flow — كيفاش تجرب

1. Open the app → Home shows the next mock match and upcoming fixtures.
2. Open any match → the watch button is **locked** (المحتوى مسدود 🔒).
3. Go back Home and tap **∗6 وضع التجربة** six times → test mode unlocks (persisted locally).
4. Open a match again → **▶️ شوف البث التجريبي** plays the bundled demo clip.
5. Kill the network / enable airplane mode and relaunch → fixtures still load from AsyncStorage.
6. Alternative unlock: Home → **⚙️ الإعدادات (الإدارة)** → type `*6` in the code box → apply.
7. Licensed stream (later): in the same admin screen, fill in provider/URL/token from your
   beIN SPORTS agreement and save — the player switches from the demo clip to that stream.

## Folder structure

```
.
├── App.tsx                      # Navigation, theme, providers
├── index.ts                     # Expo entry point
├── app.json                     # Expo config
├── assets/
│   └── video/demo-match.mp4     # Local demo clip (generated test pattern, ~460 KB)
└── src/
    ├── components/
    │   ├── MatchCard.tsx        # Fixture card (flags, score/time, venue)
    │   ├── StatusChip.tsx       # live / upcoming / finished chip
    │   └── TestModeButton.tsx   # The ∗6 unlock button
    ├── context/
    │   └── TestModeContext.tsx  # Local test-mode flag (AsyncStorage-backed)
    ├── data/
    │   └── mockMatches.ts       # Mock fixtures (teams, venues, times)
    ├── i18n/
    │   └── strings.ts           # All UI strings (Darija/Arabic)
    ├── navigation/
    │   └── types.ts             # Typed route params
    ├── screens/
    │   ├── AdminSettingsScreen.tsx  # *6 code entry + licensed stream config
    │   ├── HomeScreen.tsx
    │   ├── MatchListScreen.tsx  # SectionList grouped by date
    │   ├── MatchDetailScreen.tsx
    │   └── PlayerScreen.tsx     # expo-av player (demo clip or configured stream)
    ├── storage/
    │   ├── fixturesStore.ts     # Offline seed/load/refresh via AsyncStorage
    │   ├── streamConfigStore.ts # Licensed stream provider config (AsyncStorage)
    │   ├── useFixtures.ts       # React hook around the fixtures store
    │   └── useStreamConfig.ts   # Focus-aware hook around the stream config
    ├── theme/
    │   └── theme.ts             # Colors, spacing, radii, font sizes
    └── utils/
        └── date.ts              # Date grouping, labels, countdown (Arabic)
```

## Legal note — ملاحظة قانونية

هاد التطبيق **تجريبي 100%**: ما فيهش أي بث حقيقي ديال الماتشات، والبيانات كاملة
وهمية. إعادة بث المباريات بلا ترخيص من أصحاب الحقوق ممنوعة قانونيا — هاد المشروع
مصمم باش يبقى محلي وتجريبي فقط.

This app is 100% a demo: no real match streams are included, and all data is
mock. Rebroadcasting matches without a licence from the rights holders is
illegal — this project is designed to stay local and demo-only.
