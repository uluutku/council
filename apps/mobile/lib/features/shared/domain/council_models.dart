import '../../../core/networking/validators.dart';

class Profile {
  const Profile({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarPath,
    this.statusText,
    this.bio,
  });

  factory Profile.fromJson(JsonMap json) => Profile(
    id: requiredString(json, 'id'),
    username: optionalString(json, 'username'),
    displayName: optionalString(json, 'display_name'),
    avatarPath: optionalString(json, 'avatar_path'),
    statusText: optionalString(json, 'status_text'),
    bio: optionalString(json, 'bio'),
  );

  final String id;
  final String? username;
  final String? displayName;
  final String? avatarPath;
  final String? statusText;
  final String? bio;

  String get label => displayName?.isNotEmpty == true
      ? displayName!
      : username ?? 'Council user';
  bool get onboardingComplete => username != null && username!.isNotEmpty;
}

class UserSettings {
  const UserSettings({
    required this.theme,
    required this.notificationPreferences,
    required this.privacyPreferences,
    required this.appearancePreferences,
  });

  factory UserSettings.fromJson(JsonMap json) => UserSettings(
    theme: optionalString(json, 'theme') ?? 'system',
    notificationPreferences:
        (json['notification_preferences'] as Map?)?.cast<String, dynamic>() ??
        const {},
    privacyPreferences:
        (json['privacy_preferences'] as Map?)?.cast<String, dynamic>() ??
        const {},
    appearancePreferences:
        (json['appearance_preferences'] as Map?)?.cast<String, dynamic>() ??
        const {},
  );

  final String theme;
  final Map<String, dynamic> notificationPreferences;
  final Map<String, dynamic> privacyPreferences;
  final Map<String, dynamic> appearancePreferences;

  String get chatBackground =>
      (appearancePreferences['chat_background'] as String?) ?? 'clean';
}

class Contact {
  const Contact({
    required this.id,
    required this.username,
    required this.relationshipId,
    this.displayName,
    this.avatarPath,
    this.statusText,
  });

  factory Contact.fromJson(JsonMap json) => Contact(
    id: requiredString(json, 'id'),
    username: requiredString(json, 'username'),
    displayName: optionalString(json, 'display_name'),
    avatarPath: optionalString(json, 'avatar_path'),
    statusText: optionalString(json, 'status_text'),
    relationshipId: requiredString(json, 'relationship_id'),
  );

  final String id;
  final String username;
  final String? displayName;
  final String? avatarPath;
  final String? statusText;
  final String relationshipId;
  String get label => displayName?.isNotEmpty == true ? displayName! : username;
}

class ContactRequest {
  const ContactRequest({
    required this.relationshipId,
    required this.id,
    required this.username,
    required this.direction,
    this.displayName,
  });

  factory ContactRequest.fromJson(JsonMap json) => ContactRequest(
    relationshipId: requiredString(json, 'relationship_id'),
    id: requiredString(json, 'id'),
    username: requiredString(json, 'username'),
    displayName: optionalString(json, 'display_name'),
    direction: requiredString(json, 'direction'),
  );

  final String relationshipId;
  final String id;
  final String username;
  final String? displayName;
  final String direction;
  String get label => displayName?.isNotEmpty == true ? displayName! : username;
}

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.peerId,
    required this.peerLabel,
    required this.updatedAt,
    required this.unreadCount,
    required this.canSend,
    required this.lastSequence,
    this.preview,
    this.lastSenderId,
    this.isMuted = false,
  });

  factory ConversationSummary.fromJson(JsonMap json) => ConversationSummary(
    id: requiredString(json, 'conversation_id'),
    peerId: requiredString(json, 'peer_id'),
    peerLabel:
        optionalString(json, 'peer_display_name') ??
        optionalString(json, 'peer_username') ??
        'Council user',
    updatedAt: requiredString(json, 'updated_at'),
    unreadCount: requiredInt(json, 'unread_count'),
    canSend: requiredBool(json, 'can_send'),
    lastSequence: requiredInt(json, 'last_message_sequence'),
    preview: optionalString(json, 'last_message_content'),
    lastSenderId: optionalString(json, 'last_message_sender_id'),
    isMuted: (json['is_muted'] as bool?) ?? false,
  );

  final String id;
  final String peerId;
  final String peerLabel;
  final String updatedAt;
  final int unreadCount;
  final bool canSend;
  final int lastSequence;
  final String? preview;
  final String? lastSenderId;
  final bool isMuted;
}

class MessageAttachment {
  const MessageAttachment({
    required this.id,
    required this.bucket,
    required this.path,
    required this.filename,
    required this.mimeType,
    required this.sizeBytes,
  });

  factory MessageAttachment.fromJson(JsonMap json) => MessageAttachment(
    id: requiredString(json, 'id'),
    bucket: requiredString(json, 'storage_bucket'),
    path: requiredString(json, 'storage_path'),
    filename: requiredString(json, 'original_filename'),
    mimeType: requiredString(json, 'mime_type'),
    sizeBytes: requiredInt(json, 'size_bytes'),
  );

  final String id;
  final String bucket;
  final String path;
  final String filename;
  final String mimeType;
  final int sizeBytes;
}

class Message {
  const Message({
    required this.id,
    required this.conversationId,
    required this.senderUserId,
    required this.sequence,
    required this.createdAt,
    required this.attachments,
    this.content,
    this.replyToMessageId,
    this.editedAt,
    this.deletedAt,
  });

  factory Message.fromJson(JsonMap json) => Message(
    id: requiredString(json, 'id'),
    conversationId: requiredString(json, 'conversation_id'),
    senderUserId: requiredString(json, 'sender_user_id'),
    sequence: requiredInt(json, 'sequence'),
    content: optionalString(json, 'content'),
    replyToMessageId: optionalString(json, 'reply_to_message_id'),
    createdAt: requiredString(json, 'created_at'),
    editedAt: optionalString(json, 'edited_at'),
    deletedAt: optionalString(json, 'deleted_at'),
    attachments: asJsonMapList(
      json['attachments'],
      'attachments',
    ).map(MessageAttachment.fromJson).toList(),
  );

  final String id;
  final String conversationId;
  final String senderUserId;
  final int sequence;
  final String? content;
  final String? replyToMessageId;
  final String createdAt;
  final String? editedAt;
  final String? deletedAt;
  final List<MessageAttachment> attachments;
  bool get isDeleted => deletedAt != null;
}

class AiAgent {
  const AiAgent({
    required this.id,
    required this.slug,
    required this.name,
    required this.description,
    required this.enabled,
    this.avatarKey,
  });

  factory AiAgent.fromJson(JsonMap json) => AiAgent(
    id: requiredString(json, 'id'),
    slug: optionalString(json, 'slug') ?? '',
    name: requiredString(json, 'name'),
    description: optionalString(json, 'description') ?? '',
    avatarKey: optionalString(json, 'avatar_key'),
    enabled: requiredBool(json, 'enabled'),
  );

  final String id;
  final String slug;
  final String name;
  final String description;
  final String? avatarKey;
  final bool enabled;
}

class AiConversation {
  const AiConversation({
    required this.id,
    required this.kind,
    required this.displayName,
    required this.archived,
    this.description,
    this.avatarKey,
    this.agentId,
    this.personaId,
    this.updatedAt,
    this.lastMessageAt,
  });

  factory AiConversation.fromJson(JsonMap json) => AiConversation(
    id: requiredString(json, 'id'),
    kind: optionalString(json, 'kind') ?? 'builtin',
    displayName:
        optionalString(json, 'display_name') ??
        optionalString(json, 'agent_name') ??
        'Assistant',
    description: optionalString(json, 'description'),
    avatarKey: optionalString(json, 'avatar_key'),
    archived: (json['archived'] as bool?) ?? false,
    agentId: optionalString(json, 'agent_id'),
    personaId: optionalString(json, 'persona_id'),
    updatedAt: optionalString(json, 'updated_at'),
    lastMessageAt: optionalString(json, 'last_message_at'),
  );

  final String id;
  final String kind;
  final String displayName;
  final String? description;
  final String? avatarKey;
  final bool archived;
  final String? agentId;
  final String? personaId;
  final String? updatedAt;
  final String? lastMessageAt;
}

class AiMessage {
  const AiMessage({
    required this.id,
    required this.conversationId,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  factory AiMessage.fromJson(JsonMap json) => AiMessage(
    id: requiredString(json, 'id'),
    conversationId: requiredString(json, 'conversation_id'),
    role: requiredString(json, 'role'),
    content: requiredString(json, 'content'),
    createdAt: requiredString(json, 'created_at'),
  );

  final String id;
  final String conversationId;
  final String role;
  final String content;
  final String createdAt;
}

class AiAccess {
  const AiAccess({
    required this.accessState,
    required this.canGenerate,
    required this.trialCreditsRemaining,
    required this.proCreditsRemaining,
    required this.isPro,
  });

  factory AiAccess.fromJson(JsonMap json) => AiAccess(
    accessState: requiredString(json, 'access_state'),
    canGenerate: requiredBool(json, 'can_generate'),
    trialCreditsRemaining: requiredInt(json, 'trial_credits_remaining'),
    proCreditsRemaining: requiredInt(json, 'pro_credits_remaining'),
    isPro: requiredBool(json, 'is_pro'),
  );

  final String accessState;
  final bool canGenerate;
  final int trialCreditsRemaining;
  final int proCreditsRemaining;
  final bool isPro;
}

class AiPersona {
  const AiPersona({
    required this.id,
    required this.name,
    required this.description,
    required this.instructions,
    required this.tone,
    required this.verbosity,
    required this.archived,
  });

  factory AiPersona.fromJson(JsonMap json) => AiPersona(
    id: requiredString(json, 'id'),
    name: requiredString(json, 'name'),
    description: requiredString(json, 'description'),
    instructions: requiredString(json, 'instructions'),
    tone: requiredString(json, 'tone'),
    verbosity: requiredString(json, 'verbosity'),
    archived: requiredBool(json, 'archived'),
  );

  final String id;
  final String name;
  final String description;
  final String instructions;
  final String tone;
  final String verbosity;
  final bool archived;
}

class AiMemory {
  const AiMemory({
    required this.id,
    required this.category,
    required this.content,
  });

  factory AiMemory.fromJson(JsonMap json) => AiMemory(
    id: requiredString(json, 'id'),
    category: requiredString(json, 'category'),
    content: requiredString(json, 'content'),
  );

  final String id;
  final String category;
  final String content;
}

class Artifact {
  const Artifact({
    required this.id,
    required this.type,
    required this.title,
    required this.content,
    required this.version,
    required this.aiContactName,
    this.archivedAt,
  });

  factory Artifact.fromJson(JsonMap json) => Artifact(
    id: requiredString(json, 'id'),
    type: requiredString(json, 'type'),
    title: requiredString(json, 'title'),
    content: requiredString(json, 'current_content'),
    version: requiredInt(json, 'current_version_number'),
    aiContactName: requiredString(json, 'ai_contact_name'),
    archivedAt: optionalString(json, 'archived_at'),
  );

  final String id;
  final String type;
  final String title;
  final String content;
  final int version;
  final String aiContactName;
  final String? archivedAt;
  bool get archived => archivedAt != null;
}
