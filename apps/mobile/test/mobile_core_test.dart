import 'dart:convert';

import 'package:council_mobile/core/configuration/mobile_environment.dart';
import 'package:council_mobile/core/networking/ai_sse_parser.dart';
import 'package:council_mobile/app/theme/council_theme.dart';
import 'package:council_mobile/features/shared/domain/council_models.dart';
import 'package:flutter/material.dart';
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

  test('theme settings map to Flutter theme modes', () {
    expect(CouncilTheme.modeFromSetting('light'), ThemeMode.light);
    expect(CouncilTheme.modeFromSetting('dark'), ThemeMode.dark);
    expect(CouncilTheme.modeFromSetting('system'), ThemeMode.system);
    expect(CouncilTheme.modeFromSetting(null), ThemeMode.system);
  });

  test('AI agent and conversation mapping preserves public avatar fields', () {
    final agent = AiAgent.fromJson({
      'id': 'agent-1',
      'slug': 'coding-helper',
      'name': 'Code Council',
      'description': 'A coding agent',
      'avatar_key': 'https://example.test/avatar.png',
      'enabled': true,
    });
    expect(agent.slug, 'coding-helper');
    expect(agent.avatarKey, 'https://example.test/avatar.png');

    final conversation = AiConversation.fromJson({
      'id': 'conversation-1',
      'kind': 'builtin',
      'agent_id': 'agent-1',
      'display_name': 'Code Council',
      'description': 'A coding agent',
      'avatar_key': 'https://example.test/avatar.png',
      'archived': false,
      'updated_at': '2026-06-26T00:00:00Z',
      'last_message_at': '2026-06-26T00:01:00Z',
    });
    expect(conversation.displayName, 'Code Council');
    expect(conversation.avatarKey, 'https://example.test/avatar.png');
    expect(conversation.lastMessageAt, '2026-06-26T00:01:00Z');

    final message = AiMessage.fromJson({
      'id': 'message-1',
      'conversation_id': 'conversation-1',
      'role': 'user',
      'content': 'Hello',
      'client_message_id': 'client-1',
      'created_at': '2026-06-26T00:02:00Z',
    });
    expect(message.clientMessageId, 'client-1');
  });
}
