# Mobile builds — Android (APK/AAB) and iOS (IPA)

Umbra Vale ships as a native app on both platforms through
[Capacitor](https://capacitorjs.com/). The game itself is unchanged: the same
web bundle in `dist/` is packaged inside the app, so there is one codebase and
one set of behaviour across web, Android and iOS.

The bundle is fully self-contained (all art, audio and music are generated at
runtime), so **the app needs no network access to play**.

---

## What the native layer adds

`src/platform/native.ts` is the only platform-aware module. Every function is
a no-op on the web, so nothing else in the codebase branches on platform.

| Behaviour | Detail |
| --- | --- |
| Immersive fullscreen | Status/navigation bars hidden; re-applied when returning from the background |
| Hardware back button | Android: closes overlays and screens, exits only from the main menu |
| Lifecycle | Backgrounding pauses a live run and suspends audio |
| Haptics | Native impact/notification feedback, replacing the web Vibration API |
| Splash screen | Native splash held until the first real frame, then cross-faded |
| Service worker | Skipped — redundant when the bundle ships inside the app package |

Gamepad rumble stays in `src/input/input.ts`; device haptics live in the
platform layer, so a single event never fires both.

---

## Building

> **These builds cannot be produced on an arbitrary Linux machine.**
> Android needs the Android SDK; iOS needs macOS with Xcode and an Apple
> Developer account. The CI workflow below runs each on the right runner.

### Via CI (recommended)

`.github/workflows/mobile.yml` builds both platforms:

- **Android** on `ubuntu-latest` — produces a release APK, a release AAB
  (the Play Store upload format) and a debug APK, all as downloadable
  workflow artifacts.
- **iOS** on `macos-latest` — archives the app and exports an IPA.

It runs on every push to `main`, and on demand from the Actions tab. Artifacts
appear at the bottom of the run summary page.

Without signing secrets the jobs still succeed and emit **unsigned** builds.
Those verify that the projects compile, but only a signed build can be
installed on a device or submitted to a store.

### Locally

```bash
npm install
npm run build          # web bundle → dist/
npx cap sync           # copy dist/ into the native projects

# Android — needs the Android SDK and JDK 21
npx cap open android   # or: cd android && ./gradlew assembleRelease

# iOS — needs macOS, Xcode and CocoaPods
cd ios/App && pod install && cd ../..
npx cap open ios       # then Product → Archive in Xcode
```

Re-run `npm run build && npx cap sync` after any change to the game — the
native projects package a copy of `dist/`, they do not read it live.

---

## Signing

### Android

Create a keystore once and keep it safe — losing it means you can never update
the app on Google Play under the same listing:

```bash
keytool -genkey -v -keystore release.keystore -alias umbravale \
  -keyalg RSA -keysize 2048 -validity 10000
```

**For CI**, add these repository secrets (Settings → Secrets and variables →
Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `umbravale` |
| `ANDROID_KEY_PASSWORD` | Key password |

**For local builds**, create `android/keystore.properties` (already ignored by
git):

```properties
storeFile=/absolute/path/to/release.keystore
storePassword=…
keyAlias=umbravale
keyPassword=…
```

No credentials are ever committed: `android/app/build.gradle` reads them from
the environment or that ignored file, and falls back to an unsigned build.

### iOS

Requires a paid **Apple Developer Program** membership ($99/year). Export your
distribution certificate as a `.p12` and download the matching provisioning
profile, then add:

| Secret | Value |
| --- | --- |
| `IOS_CERTIFICATE_BASE64` | `base64 -i cert.p12` |
| `IOS_CERTIFICATE_PASSWORD` | The `.p12` export password |
| `IOS_PROVISIONING_PROFILE_BASE64` | `base64 -i profile.mobileprovision` |
| `IOS_TEAM_ID` | Your 10-character Apple Team ID |

---

## Publishing

### Google Play

1. Create the app at [Play Console](https://play.google.com/console) → the
   package name must match `com.umbravale.game`.
2. Upload the **AAB** (`umbra-vale-android-aab` artifact). Play requires the
   App Bundle format for new apps; the APK is for direct/side-load
   distribution.
3. Complete the content rating, data-safety and privacy sections. Umbra Vale
   collects nothing and sends nothing — all progress lives in local storage on
   the device — so the data-safety form is entirely "no data collected".
4. Bump `versionCode` (must strictly increase) and `versionName` in
   `android/app/build.gradle` for every release.

### App Store

1. Create the app in [App Store Connect](https://appstoreconnect.apple.com)
   with bundle id `com.umbravale.game`.
2. Upload the IPA with Xcode Organizer or
   `xcrun altool --upload-app -f UmbraVale.ipa`.
3. Set the version and build number in `ios/App/App/Info.plist`
   (`CFBundleShortVersionString` / `CFBundleVersion`) — the build number must
   increase with every upload.

### Changing the app identity

The bundle id lives in three places and must stay consistent:
`capacitor.config.ts`, `android/app/build.gradle` (`applicationId` and
`namespace`), and the Xcode project's `PRODUCT_BUNDLE_IDENTIFIER`. Change it
before the first store submission — it cannot be changed afterwards.

---

## Regenerating icons and splash screens

Launcher icons and splash screens are generated from the same original wyrm
sigil used by the web build, at every density Android and iOS require. They
are committed, so a normal build never needs to regenerate them; do so only if
the artwork changes.
