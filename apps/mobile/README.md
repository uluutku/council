# Council Mobile

Flutter mobile client for Council.

## Run

```bash
flutter pub get
flutter run --dart-define-from-file=config/local.json
```

Use `config/local.example.json` as the template. Do not commit `config/local.json`.

## Architecture

The app uses a feature-first Flutter structure with Riverpod providers, `go_router`, Supabase
repositories, typed mapping functions, local persistence for drafts and offline text queueing, and
strict AI SSE parsing.

## Validation

From the repository root:

```bash
npm run mobile:verify
```

Android builds are supported on this Windows host. iOS builds require macOS with Xcode and
CocoaPods.
