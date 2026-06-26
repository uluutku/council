import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme/council_theme.dart';
import '../features/shared/data/council_repositories.dart';

class CouncilMobileApp extends ConsumerWidget {
  const CouncilMobileApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final signedIn = ref.watch(authUserProvider).value != null;
    final settings = signedIn ? ref.watch(settingsProvider).value : null;
    return MaterialApp.router(
      title: 'Council',
      debugShowCheckedModeBanner: false,
      theme: CouncilTheme.light(),
      darkTheme: CouncilTheme.dark(),
      themeMode: CouncilTheme.modeFromSetting(settings?.theme),
      routerConfig: router,
    );
  }
}
