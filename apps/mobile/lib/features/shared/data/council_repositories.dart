import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../core/configuration/mobile_environment.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/networking/ai_sse_parser.dart';
import '../../../core/networking/validators.dart';
import '../domain/council_models.dart';

final supabaseClientProvider = Provider<SupabaseClient>(
  (_) => Supabase.instance.client,
);
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(supabaseClientProvider)),
);
final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => AccountRepository(ref.watch(supabaseClientProvider)),
);
final contactsRepositoryProvider = Provider<ContactsRepository>(
  (ref) => ContactsRepository(ref.watch(supabaseClientProvider)),
);
final messagingRepositoryProvider = Provider<MessagingRepository>(
  (ref) => MessagingRepository(ref.watch(supabaseClientProvider)),
);
final aiRepositoryProvider = Provider<AiRepository>(
  (ref) => AiRepository(
    ref.watch(supabaseClientProvider),
    ref.watch(mobileEnvironmentProvider),
  ),
);
final artifactsRepositoryProvider = Provider<ArtifactsRepository>(
  (ref) => ArtifactsRepository(ref.watch(supabaseClientProvider)),
);
final accessRepositoryProvider = Provider<AccessRepository>(
  (ref) => AccessRepository(ref.watch(supabaseClientProvider)),
);

final authUserProvider = StreamProvider<User?>((ref) {
  final auth = ref.watch(supabaseClientProvider).auth;
  return auth.onAuthStateChange.map((event) => event.session?.user).distinct();
});

final currentProfileProvider = FutureProvider<Profile?>((ref) async {
  final user = ref.watch(authUserProvider).value;
  if (user == null) return null;
  return ref.watch(accountRepositoryProvider).getMyProfile();
});

final settingsProvider = FutureProvider<UserSettings?>((ref) async {
  final user = ref.watch(authUserProvider).value;
  if (user == null) return null;
  return ref.watch(accountRepositoryProvider).getMySettings();
});

class AuthRepository {
  const AuthRepository(this.client);
  final SupabaseClient client;

  Future<void> signIn(String email, String password) async {
    await client.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> register(String email, String password) async {
    await client.auth.signUp(
      email: email.trim(),
      password: password,
      emailRedirectTo: 'council://auth-callback',
    );
  }

  Future<void> resendVerification(String email) async {
    await client.auth.resend(type: OtpType.signup, email: email.trim());
  }

  Future<void> forgotPassword(String email) async {
    await client.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo: 'council://auth-callback',
    );
  }

  Future<void> resetPassword(String password) async {
    await client.auth.updateUser(UserAttributes(password: password));
  }

  Future<void> signOut() => client.auth.signOut();
}

class AccountRepository {
  const AccountRepository(this.client);
  final SupabaseClient client;

  Future<Profile> getMyProfile() async {
    final userId = client.auth.currentUser?.id;
    if (userId == null)
      throw const AppError(AppErrorKind.authenticationRequired, 'Sign in.');
    Object? lastError;
    for (var attempt = 0; attempt < 4; attempt += 1) {
      try {
        final data = await client
            .from('profiles')
            .select()
            .eq('id', userId)
            .maybeSingle();
        if (data != null) return Profile.fromJson(asJsonMap(data, 'profile'));
      } catch (error) {
        lastError = error;
      }
      await Future<void>.delayed(Duration(milliseconds: 150 * (1 << attempt)));
    }
    if (lastError != null) throw AppError.from(lastError);
    throw const AppError(AppErrorKind.unavailable, 'Profile is not ready yet.');
  }

  Future<UserSettings> getMySettings() async {
    final userId = client.auth.currentUser?.id;
    if (userId == null)
      throw const AppError(AppErrorKind.authenticationRequired, 'Sign in.');
    Object? lastError;
    for (var attempt = 0; attempt < 4; attempt += 1) {
      try {
        final data = await client
            .from('user_settings')
            .select()
            .eq('user_id', userId)
            .maybeSingle();
        if (data != null)
          return UserSettings.fromJson(asJsonMap(data, 'settings'));
      } catch (error) {
        lastError = error;
      }
      await Future<void>.delayed(Duration(milliseconds: 150 * (1 << attempt)));
    }
    if (lastError != null) throw AppError.from(lastError);
    throw const AppError(
      AppErrorKind.unavailable,
      'Settings are not ready yet.',
    );
  }

  Future<Profile> setProfile({
    String? username,
    String? displayName,
    String? bio,
    String? statusText,
    String? avatarPath,
  }) async {
    final data = await client
        .rpc(
          'set_my_profile',
          params: {
            'username': username,
            'display_name': displayName,
            'bio': bio,
            'avatar_path': avatarPath,
            'status_text': statusText,
          },
        )
        .single();
    return Profile.fromJson(asJsonMap(data, 'profile'));
  }

  Future<UserSettings> updateSettings({
    String? theme,
    Map<String, dynamic>? notifications,
    Map<String, dynamic>? privacy,
    Map<String, dynamic>? appearance,
  }) async {
    final data = await client
        .rpc(
          'update_my_settings',
          params: {
            'p_theme': theme,
            'p_notification_preferences': notifications,
            'p_privacy_preferences': privacy,
            'p_appearance_preferences': appearance,
          },
        )
        .single();
    return UserSettings.fromJson(asJsonMap(data, 'settings'));
  }

  Future<String> uploadAvatar(File file) async {
    final userId = client.auth.currentUser?.id;
    if (userId == null)
      throw const AppError(AppErrorKind.authenticationRequired, 'Sign in.');
    final mime = lookupMimeType(file.path) ?? 'image/jpeg';
    final path =
        '$userId/profile-${const Uuid().v4()}.${mime.split('/').last.replaceAll('jpeg', 'jpg')}';
    await client.storage.from('profile-avatars').upload(path, file);
    return path;
  }
}

class ContactsRepository {
  const ContactsRepository(this.client);
  final SupabaseClient client;

  Future<List<Contact>> listContacts() async {
    final data = await client.rpc('list_my_contacts');
    return asJsonMapList(data, 'contacts').map(Contact.fromJson).toList();
  }

  Future<List<ContactRequest>> listRequests() async {
    final data = await client.rpc('list_my_contact_requests');
    return asJsonMapList(
      data,
      'requests',
    ).map(ContactRequest.fromJson).toList();
  }

  Future<List<Contact>> search(String query) async {
    if (query.trim().length < 2) return const [];
    final data = await client.rpc(
      'search_profiles',
      params: {'query': query.trim(), 'result_limit': 20},
    );
    return asJsonMapList(data, 'profiles')
        .map(
          (json) => Contact(
            id: requiredString(json, 'id'),
            username: requiredString(json, 'username'),
            relationshipId: optionalString(json, 'relationship_id') ?? '',
            displayName: optionalString(json, 'display_name'),
            avatarPath: optionalString(json, 'avatar_path'),
            statusText: optionalString(json, 'status_text'),
          ),
        )
        .toList();
  }

  Future<void> sendRequest(String userId) =>
      client.rpc('send_contact_request', params: {'target_user_id': userId});

  Future<void> respond(String relationshipId, String response) => client.rpc(
    'respond_contact_request',
    params: {'relationship_id': relationshipId, 'response': response},
  );

  Future<void> remove(String userId) =>
      client.rpc('remove_contact', params: {'target_user_id': userId});
  Future<void> block(String userId) =>
      client.rpc('block_user', params: {'target_user_id': userId});
  Future<void> unblock(String userId) =>
      client.rpc('unblock_user', params: {'target_user_id': userId});
}

class MessagingRepository {
  const MessagingRepository(this.client);
  final SupabaseClient client;

  Future<List<ConversationSummary>> listConversations({
    String? cursorUpdatedAt,
    String? cursorId,
  }) async {
    final data = await client.rpc(
      'list_my_conversations',
      params: {
        'result_limit': 30,
        'cursor_updated_at': cursorUpdatedAt,
        'cursor_id': cursorId,
      },
    );
    return asJsonMapList(
      data,
      'conversations',
    ).map(ConversationSummary.fromJson).toList();
  }

  Future<String> createOrGetDirect(String targetUserId) async {
    final data = await client
        .rpc(
          'create_or_get_direct_conversation',
          params: {'target_user_id': targetUserId},
        )
        .single();
    return requiredString(asJsonMap(data, 'conversation'), 'conversation_id');
  }

  Future<List<Message>> listMessages(
    String conversationId, {
    int? beforeSequence,
  }) async {
    final data = await client.rpc(
      'list_conversation_messages',
      params: {
        'p_conversation_id': conversationId,
        'p_before_sequence': beforeSequence,
        'p_result_limit': 50,
      },
    );
    return asJsonMapList(
      data,
      'messages',
    ).map(Message.fromJson).toList().reversed.toList();
  }

  Future<Message> sendText({
    required String conversationId,
    required String clientMessageId,
    required String content,
    String? replyToMessageId,
    List<String> attachmentIds = const [],
  }) async {
    final data = await client
        .rpc(
          'send_message',
          params: {
            'p_conversation_id': conversationId,
            'p_client_message_id': clientMessageId,
            'p_content': content.trim().isEmpty ? null : content.trim(),
            'p_reply_to_message_id': replyToMessageId,
            'p_attachment_ids': attachmentIds,
          },
        )
        .single();
    return Message.fromJson(asJsonMap(data, 'message'));
  }

  Future<Message> editMessage(String messageId, String content) async {
    final data = await client
        .rpc(
          'edit_message',
          params: {'p_message_id': messageId, 'p_content': content},
        )
        .single();
    return Message.fromJson(asJsonMap(data, 'message'));
  }

  Future<void> deleteMessage(String messageId) =>
      client.rpc('delete_message', params: {'p_message_id': messageId});

  Future<void> react(String messageId, String emoji) => client.rpc(
    'add_message_reaction',
    params: {'p_message_id': messageId, 'p_emoji': emoji},
  );

  Future<void> deleteForMe(String conversationId) => client.rpc(
    'delete_conversation_for_me',
    params: {'p_conversation_id': conversationId},
  );

  Future<void> mute(
    String conversationId, {
    int? seconds,
    bool forever = false,
  }) => client.rpc(
    'set_conversation_mute',
    params: {
      'p_conversation_id': conversationId,
      'p_duration_seconds': seconds,
      'p_forever': forever,
    },
  );

  Future<void> markRead(String conversationId, int sequence) => client.rpc(
    'mark_conversation_read',
    params: {
      'p_conversation_id': conversationId,
      'p_through_sequence': sequence,
    },
  );

  RealtimeChannel subscribeConversation(
    String conversationId,
    void Function() onChanged,
  ) {
    return client
        .channel(
          'conversation:$conversationId',
          opts: const RealtimeChannelConfig(private: true),
        )
        .onBroadcast(event: '*', callback: (_) => onChanged())
        .subscribe();
  }

  RealtimeChannel subscribeInbox(String userId, void Function() onChanged) {
    return client
        .channel(
          'user:$userId:inbox',
          opts: const RealtimeChannelConfig(private: true),
        )
        .onBroadcast(event: '*', callback: (_) => onChanged())
        .subscribe();
  }
}

class AiRepository {
  const AiRepository(this.client, this.environment);
  final SupabaseClient client;
  final MobileEnvironment environment;

  Future<List<AiAgent>> listAgents() async {
    final data = await client.rpc('list_ai_agents');
    return asJsonMapList(data, 'agents').map(AiAgent.fromJson).toList();
  }

  Future<List<AiConversation>> listConversations() async {
    final data = await client.rpc(
      'list_my_ai_conversations',
      params: {'p_limit': 30},
    );
    return asJsonMapList(
      data,
      'ai conversations',
    ).map(AiConversation.fromJson).toList();
  }

  Future<AiConversation> openConversation({
    String? agentId,
    String? personaId,
  }) async {
    final data = await client
        .rpc(
          'get_or_create_ai_conversation',
          params: {'p_agent_id': agentId, 'p_persona_id': personaId},
        )
        .single();
    return AiConversation.fromJson(asJsonMap(data, 'ai conversation'));
  }

  Future<List<AiMessage>> listMessages(String conversationId) async {
    final data = await client.rpc(
      'list_ai_messages',
      params: {
        'p_conversation_id': conversationId,
        'p_limit': 100,
        'p_before_created_at': null,
        'p_before_id': null,
      },
    );
    return asJsonMapList(
      data,
      'ai messages',
    ).map(AiMessage.fromJson).toList().reversed.toList();
  }

  Future<AiAccess> getAccess() async {
    final data = await client.rpc('get_my_ai_access').single();
    return AiAccess.fromJson(asJsonMap(data, 'ai access'));
  }

  Stream<AiStreamEvent> streamMessage({
    required String conversationId,
    required String content,
    required String clientMessageId,
    List<String> attachmentIds = const [],
    List<String> documentAttachmentIds = const [],
    Map<String, dynamic>? contextImport,
  }) async* {
    final session = client.auth.currentSession;
    if (session == null)
      throw const AppError(AppErrorKind.authenticationRequired, 'Sign in.');
    final request = http.Request(
      'POST',
      Uri.parse(environment.effectiveAiFunctionUrl),
    );
    request.headers.addAll({
      'content-type': 'application/json',
      'apikey': environment.supabaseAnonKey,
      'authorization': 'Bearer ${session.accessToken}',
    });
    request.body = jsonEncode({
      'conversation_id': conversationId,
      'client_message_id': clientMessageId,
      'content': content,
      'attachment_ids': attachmentIds,
      'document_attachment_ids': documentAttachmentIds,
      'context_import': contextImport,
    });
    final response = await request.send();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const AppError(
        AppErrorKind.providerUnavailable,
        'AI is unavailable.',
      );
    }
    final parser = AiSseParser();
    await for (final chunk in response.stream) {
      for (final event in parser.add(chunk)) {
        yield event;
      }
    }
    for (final event in parser.close()) {
      yield event;
    }
  }

  Future<List<AiPersona>> listPersonas() async {
    final data = await client.rpc('list_my_custom_personas');
    return asJsonMapList(data, 'personas').map(AiPersona.fromJson).toList();
  }

  Future<AiPersona> savePersona({
    String? id,
    required String name,
    required String description,
    required String instructions,
    required String tone,
    required String verbosity,
    String? avatarPath,
  }) async {
    final rpc = id == null ? 'create_custom_persona' : 'update_custom_persona';
    final params = {
      if (id != null) 'p_persona_id': id,
      'p_name': name,
      'p_description': description,
      'p_instructions': instructions,
      'p_tone': tone,
      'p_verbosity': verbosity,
      'p_avatar_path': avatarPath,
    };
    final data = await client.rpc(rpc, params: params).single();
    return AiPersona.fromJson(asJsonMap(data, 'persona'));
  }

  Future<List<AiMemory>> listMemories(String conversationId) async {
    final data = await client.rpc(
      'list_ai_memories',
      params: {'p_conversation_id': conversationId},
    );
    return asJsonMapList(data, 'memories').map(AiMemory.fromJson).toList();
  }

  Future<void> createMemory(
    String conversationId,
    String category,
    String content,
  ) => client.rpc(
    'create_ai_memory',
    params: {
      'p_conversation_id': conversationId,
      'p_category': category,
      'p_content': content,
      'p_source_message_id': null,
    },
  );

  Future<void> deleteAiConversation(String conversationId) => client.rpc(
    'delete_ai_conversation',
    params: {'p_conversation_id': conversationId},
  );
}

class ArtifactsRepository {
  const ArtifactsRepository(this.client);
  final SupabaseClient client;

  Future<List<Artifact>> list() async {
    final data = await client.rpc(
      'list_my_ai_artifacts',
      params: {'p_include_archived': true, 'p_limit': 100},
    );
    return asJsonMapList(data, 'artifacts').map(Artifact.fromJson).toList();
  }

  Future<Artifact> get(String id) async {
    final data = await client.rpc(
      'get_ai_artifact',
      params: {'p_artifact_id': id},
    );
    return Artifact.fromJson(asJsonMap(data, 'artifact'));
  }

  Future<Artifact> saveVersion(
    String id,
    String content,
    int expectedVersion,
  ) async {
    final data = await client.rpc(
      'create_ai_artifact_version',
      params: {
        'p_artifact_id': id,
        'p_content': content,
        'p_created_by': 'user',
        'p_client_request_id': const Uuid().v4(),
        'p_expected_current_version': expectedVersion,
      },
    );
    return Artifact.fromJson(asJsonMap(data, 'artifact'));
  }

  Future<void> setArchived(String id, bool archived) => client.rpc(
    archived ? 'archive_ai_artifact' : 'restore_ai_artifact',
    params: {'p_artifact_id': id},
  );
}

class AccessRepository {
  const AccessRepository(this.client);
  final SupabaseClient client;

  Future<AiAccess> getAccess() async {
    final data = await client.rpc('get_my_ai_access').single();
    return AiAccess.fromJson(asJsonMap(data, 'access'));
  }

  Future<void> redeem(String code) =>
      client.rpc('redeem_premium_access_code', params: {'p_code': code.trim()});

  Future<List<JsonMap>> grantHistory() async {
    final data = await client.rpc(
      'list_my_premium_grants',
      params: {'p_limit': 20},
    );
    return asJsonMapList(data, 'premium grants');
  }
}
