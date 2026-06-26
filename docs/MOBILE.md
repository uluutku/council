# Mobile

Council mobile lives in `apps/mobile` and is a Flutter/Dart app targeting Android and iOS.

## Toolchain

The initial Windows implementation was verified with Flutter 3.44.4, Dart 3.12.2, Android SDK 36,
Android build-tools 36.0.0, Android Emulator 36.6.11, and Microsoft OpenJDK 17. iOS project files
are generated and maintained, but iOS builds require macOS, Xcode, and CocoaPods.

## Configuration

Create `apps/mobile/config/local.json` from `apps/mobile/config/local.example.json` and fill only
public mobile values:

```json
{
  "APP_ENV": "local",
  "SUPABASE_URL": "http://127.0.0.1:54321",
  "SUPABASE_ANON_KEY": "LOCAL_PUBLIC_ANON_KEY",
  "AI_FUNCTION_URL": "http://127.0.0.1:54321/functions/v1/ai-chat"
}
```

Android emulators reach local services through `10.0.2.2`; iOS simulators may use `127.0.0.1`.
The app centralizes local host rewriting in `MobileEnvironment`. Release-mode production builds
require HTTPS.

## Commands

- `npm run mobile:get`
- `npm run mobile:analyze`
- `npm run mobile:format`
- `npm run mobile:test`
- `npm run mobile:build:android`
- `npm run mobile:build:ios` on macOS only
- `npm run mobile:verify`

## Security

The mobile app uses Supabase Auth, RLS, private Storage, authenticated Realtime topics, and the
existing `ai-chat` Edge Function. It does not contain service-role keys, OpenRouter keys, signing
keys, or Firebase service-account credentials. Local drafts and offline text queues are scoped by
authenticated user id and cleared on sign out.

Background push delivery is represented by the client notification abstraction. Production
background push still requires Firebase/APNs credentials and a backend dispatch configuration; the
current verified path is foreground local notification support from Realtime hints.

## Platform Limits

On Windows, Android builds and tests can run locally. iOS simulator builds cannot run on Windows.
Apple signing credentials, an Apple Developer account, and CocoaPods are external macOS
requirements.
