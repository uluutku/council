import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppEnvironment { local, development, production, test }

final mobileEnvironmentProvider = Provider<MobileEnvironment>(
  (_) => MobileEnvironment.fromDartDefines(),
);

class MobileEnvironment {
  const MobileEnvironment({
    required this.appEnvironment,
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    required this.aiFunctionUrl,
    this.localHostOverride,
  });

  factory MobileEnvironment.fromDartDefines() {
    const env = String.fromEnvironment('APP_ENV', defaultValue: 'local');
    final appEnvironment = switch (env) {
      'production' => AppEnvironment.production,
      'development' => AppEnvironment.development,
      'test' => AppEnvironment.test,
      _ => AppEnvironment.local,
    };
    const url = String.fromEnvironment('SUPABASE_URL');
    const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
    const aiUrl = String.fromEnvironment('AI_FUNCTION_URL');
    const localHost = String.fromEnvironment('LOCAL_BACKEND_HOST');
    if (url.isEmpty || anonKey.isEmpty || aiUrl.isEmpty) {
      throw StateError(
        'SUPABASE_URL, SUPABASE_ANON_KEY, and AI_FUNCTION_URL are required.',
      );
    }
    final environment = MobileEnvironment(
      appEnvironment: appEnvironment,
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      aiFunctionUrl: aiUrl,
      localHostOverride: localHost.isEmpty ? null : localHost,
    );
    environment.validateForRuntime();
    return environment;
  }

  final AppEnvironment appEnvironment;
  final String supabaseUrl;
  final String supabaseAnonKey;
  final String aiFunctionUrl;
  final String? localHostOverride;

  bool get isLocal => appEnvironment == AppEnvironment.local;
  bool get isReleaseLike =>
      appEnvironment == AppEnvironment.production && kReleaseMode;

  String get effectiveSupabaseUrl => resolveUrl(supabaseUrl);
  String get effectiveAiFunctionUrl => resolveUrl(aiFunctionUrl);

  String resolveUrl(String input) {
    final uri = Uri.parse(input);
    if (!isLocal || uri.scheme != 'http') return input;
    final replacementHost =
        localHostOverride ?? (Platform.isAndroid ? '10.0.2.2' : uri.host);
    return uri.replace(host: replacementHost).toString();
  }

  void validateForRuntime() {
    for (final raw in [supabaseUrl, aiFunctionUrl]) {
      final uri = Uri.tryParse(raw);
      if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
        throw StateError('Invalid mobile backend URL.');
      }
      if (isReleaseLike && uri.scheme != 'https') {
        throw StateError('Release mobile builds require HTTPS backend URLs.');
      }
    }
    if (supabaseAnonKey.trim().isEmpty) {
      throw StateError('Supabase anon key is required.');
    }
  }
}
