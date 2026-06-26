import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';
import 'core/configuration/mobile_environment.dart';
import 'core/notifications/local_notifications.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final environment = MobileEnvironment.fromDartDefines();
  await Supabase.initialize(
    url: environment.effectiveSupabaseUrl,
    publishableKey: environment.supabaseAnonKey,
    authOptions: const FlutterAuthClientOptions(
      authFlowType: AuthFlowType.pkce,
    ),
  );
  await LocalNotifications.instance.initialize();
  runApp(
    ProviderScope(
      overrides: [mobileEnvironmentProvider.overrideWithValue(environment)],
      child: const CouncilMobileApp(),
    ),
  );
}
