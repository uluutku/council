import 'dart:convert';

import 'package:council_mobile/core/configuration/mobile_environment.dart';
import 'package:council_mobile/core/networking/ai_sse_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('local Android host mapping is centralized', () {
    const environment = MobileEnvironment(
      appEnvironment: AppEnvironment.local,
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'anon',
      aiFunctionUrl: 'http://127.0.0.1:54321/functions/v1/ai-chat',
      localHostOverride: '10.0.2.2',
    );
    expect(environment.effectiveSupabaseUrl, 'http://10.0.2.2:54321');
  });

  test('AI SSE parser requires exactly one terminal event', () {
    final parser = AiSseParser();
    final events = parser.add(
      utf8.encode('data: {"type":"start","run_id":"r"}\n\n'),
    );
    expect(events.single, isA<AiStreamStart>());
    parser.add(
      utf8.encode(
        'data: {"type":"done","message":{"id":"m","content":"ok","created_at":"now"}}\n\n',
      ),
    );
    expect(parser.close().length, 0);
  });

  test('AI SSE parser rejects EOF without terminal event', () {
    final parser = AiSseParser();
    parser.add(utf8.encode('data: {"type":"delta","text":"partial"}\n\n'));
    expect(parser.close, throwsFormatException);
  });
}
