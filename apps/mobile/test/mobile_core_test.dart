import 'dart:convert';

import 'package:council_mobile/app/theme/council_theme.dart';
import 'package:council_mobile/core/configuration/mobile_environment.dart';
import 'package:council_mobile/core/networking/ai_sse_parser.dart';
import 'package:council_mobile/core/persistence/local_store.dart';
import 'package:council_mobile/features/ai/presentation/safe_markdown.dart';
import 'package:council_mobile/features/authentication/presentation/auth_screens.dart';
import 'package:council_mobile/features/shared/domain/council_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  test(
    'AI SSE parser handles split events and rejects duplicate terminal events',
    () {
      final parser = AiSseParser();
      expect(parser.add(utf8.encode('data: {"type":"del')), isEmpty);
      final deltas = parser.add(utf8.encode('ta","text":"hi"}\n\n'));
      expect(deltas.single, isA<AiStreamDelta>());
      parser.add(
        utf8.encode(
          'data: {"type":"done","message":{"id":"m","content":"ok","created_at":"now"}}\n\n',
        ),
      );
      expect(
        () => parser.add(
          utf8.encode('data: {"type":"error","category":"x"}\n\n'),
        ),
        throwsFormatException,
      );
    },
  );

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

  test(
    'settings and search contract mappings preserve bounded public fields',
    () {
      final settings = UserSettings.fromJson({
        'theme': 'dark',
        'notification_preferences': {'message_previews': false},
        'privacy_preferences': {'show_online_status': true},
        'appearance_preferences': {'chat_background': 'paper'},
      });
      expect(settings.chatBackground, 'paper');

      final blocked = BlockedUser.fromJson({
        'id': 'blocked-1',
        'username': 'blocked_user',
        'display_name': 'Blocked User',
        'avatar_path': null,
        'status_text': 'Away',
        'blocked_at': '2026-06-26T00:00:00Z',
      });
      expect(blocked.label, 'Blocked User');
      expect(blocked.username, 'blocked_user');

      final conversation = ConversationSearchResult.fromJson({
        'conversation_id': 'conversation-1',
        'peer_id': 'peer-1',
        'peer_username': 'ada',
        'peer_display_name': null,
        'peer_avatar_path': null,
      });
      expect(conversation.peerLabel, 'ada');

      final result = MessageSearchResult.fromJson({
        'conversation_id': 'conversation-1',
        'message_id': 'message-1',
        'sequence': 42,
        'snippet': 'bounded snippet',
        'sender_id': 'sender-1',
        'created_at': '2026-06-26T00:01:00Z',
        'peer_username': 'ada',
        'peer_display_name': 'Ada',
        'peer_avatar_path': null,
      });
      expect(result.peerLabel, 'Ada');
      expect(result.sequence, 42);
    },
  );

  test(
    'local store bounds user-scoped drafts and queue, then clears by user',
    () async {
      SharedPreferences.setMockInitialValues({});
      final store = LocalStore();
      final longDraft = 'x' * 9001;
      await store.writeDraft('user-a', 'human', 'conversation-a', longDraft);
      await store.writeDraft('user-b', 'human', 'conversation-a', 'keep');

      expect(
        (await store.readDraft('user-a', 'human', 'conversation-a'))!.length,
        8000,
      );
      expect(
        await store.readDraft('user-b', 'human', 'conversation-a'),
        'keep',
      );

      await store.writeQueue(
        'user-a',
        List.generate(60, (index) => {'client_message_id': 'id-$index'}),
      );
      expect(await store.readQueue('user-a'), hasLength(50));

      await store.clearUser('user-a');
      expect(
        await store.readDraft('user-a', 'human', 'conversation-a'),
        isNull,
      );
      expect(await store.readQueue('user-a'), isEmpty);
      expect(
        await store.readDraft('user-b', 'human', 'conversation-a'),
        'keep',
      );
    },
  );

  testWidgets('auth email field accepts focus and text input', (tester) async {
    final email = TextEditingController();
    final password = TextEditingController();
    final emailFocus = FocusNode();
    final passwordFocus = FocusNode();
    addTearDown(() {
      email.dispose();
      password.dispose();
      emailFocus.dispose();
      passwordFocus.dispose();
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: CouncilTheme.light(),
        home: Scaffold(
          body: Column(
            children: [
              AuthTextField(
                controller: email,
                focusNode: emailFocus,
                label: 'Email',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                onSubmitted: (_) => passwordFocus.requestFocus(),
              ),
              AuthTextField(
                controller: password,
                focusNode: passwordFocus,
                label: 'Password',
                obscureText: true,
              ),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.widgetWithText(TextField, 'Email'));
    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'a@b.test');
    await tester.testTextInput.receiveAction(TextInputAction.next);

    expect(email.text, 'a@b.test');
    expect(passwordFocus.hasFocus, isTrue);
  });

  testWidgets('safe markdown suppresses remote images', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: CouncilTheme.light(),
        home: const Scaffold(
          body: SafeMarkdown('![pixel](https://example.test/pixel.png)'),
        ),
      ),
    );

    expect(find.text('[remote image omitted]'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });
}
