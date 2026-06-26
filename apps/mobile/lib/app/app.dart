import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme/council_theme.dart';

class CouncilMobileApp extends ConsumerWidget {
  const CouncilMobileApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Council',
      debugShowCheckedModeBanner: false,
      theme: CouncilTheme.light(),
      darkTheme: CouncilTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
