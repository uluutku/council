import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../../../app/theme/council_theme.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/networking/ai_sse_parser.dart';
import '../../../core/persistence/local_store.dart';
import '../../../core/widgets/chat_background.dart';
import '../../../core/widgets/common.dart';
import '../../shared/data/council_repositories.dart';
import '../../shared/domain/council_models.dart';
import 'safe_markdown.dart';

final aiAgentsProvider = FutureProvider<List<AiAgent>>(
  (ref) => ref.watch(aiRepositoryProvider).listAgents(),
);
final aiConversationsProvider = FutureProvider<List<AiConversation>>(
  (ref) => ref.watch(aiRepositoryProvider).listConversations(),
);
final aiConversationProvider = FutureProvider.family<AiConversation?, String>((
  ref,
  id,
) async {
  final conversations = await ref
      .watch(aiRepositoryProvider)
      .listConversations();
  for (final conversation in conversations) {
    if (conversation.id == id) return conversation;
  }
  return null;
});
final aiMessagesProvider = FutureProvider.family<List<AiMessage>, String>(
  (ref, id) => ref.watch(aiRepositoryProvider).listMessages(id),
);
final aiAccessProvider = FutureProvider<AiAccess>(
  (ref) => ref.watch(aiRepositoryProvider).getAccess(),
);
final personasProvider = FutureProvider<List<AiPersona>>(
  (ref) => ref.watch(aiRepositoryProvider).listPersonas(),
);

class AiHomeScreen extends ConsumerWidget {
  const AiHomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agents = ref.watch(aiAgentsProvider);
    final personas = ref.watch(personasProvider);
    final access = ref.watch(aiAccessProvider).value;
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI'),
        actions: [
          IconButton(
            tooltip: 'New persona',
            onPressed: () => context.push('/ai/personas/new'),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(aiAgentsProvider);
          ref.invalidate(personasProvider);
          ref.invalidate(aiAccessProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (access != null)
              CouncilPanel(
                margin: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Icon(
                      Icons.verified_outlined,
                      color: access.isPro
                          ? Theme.of(context).colorScheme.primary
                          : context.councilColors.textSecondary,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        access.isPro ? 'Premium access' : 'Trial access',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    CouncilPill(
                      label: 'Pro ${access.proCreditsRemaining}',
                      ai: true,
                    ),
                    const SizedBox(width: 6),
                    CouncilPill(label: 'Trial ${access.trialCreditsRemaining}'),
                  ],
                ),
              ),
            const SizedBox(height: 4),
            Text(
              'Built-in contacts',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            agents.when(
              data: (items) => Column(
                children: items
                    .map(
                      (agent) => AiAgentCatalogueCard(
                        agent: agent,
                        onOpen: () async {
                          final convo = await ref
                              .read(aiRepositoryProvider)
                              .openConversation(agentId: agent.id);
                          ref.invalidate(aiConversationsProvider);
                          if (context.mounted) context.push('/ai/${convo.id}');
                        },
                      ),
                    )
                    .toList(),
              ),
              error: (e, _) => ErrorBanner(AppError.from(e).message),
              loading: () => const Center(child: CircularProgressIndicator()),
            ),
            const SizedBox(height: 20),
            Text(
              'Custom personas',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            personas.when(
              data: (items) => items.isEmpty
                  ? const CouncilListTile(
                      leading: Icon(Icons.person_4_outlined),
                      title: 'No custom personas yet',
                      subtitle:
                          'Create a private AI contact with its own style.',
                    )
                  : Column(
                      children: [
                        for (var index = 0; index < items.length; index++)
                          FadeSlideIn(
                            delay: Duration(milliseconds: index * 24),
                            child: PersonaCatalogueCard(
                              persona: items[index],
                              onEdit: () => context.push(
                                '/ai/personas/${items[index].id}/edit',
                              ),
                              onOpen: items[index].archived
                                  ? null
                                  : () async {
                                      final convo = await ref
                                          .read(aiRepositoryProvider)
                                          .openConversation(
                                            personaId: items[index].id,
                                          );
                                      ref.invalidate(aiConversationsProvider);
                                      if (context.mounted) {
                                        context.push('/ai/${convo.id}');
                                      }
                                    },
                            ),
                          ),
                      ],
                    ),
              error: (e, _) => ErrorBanner(AppError.from(e).message),
              loading: () => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }
}

class AiAgentCatalogueCard extends StatelessWidget {
  const AiAgentCatalogueCard({
    required this.agent,
    required this.onOpen,
    super.key,
  });

  final AiAgent agent;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final tone = _agentTone(agent);
    final tags = _agentTags(tone);
    final colors = context.councilColors;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 3 / 2,
            child: _AgentMedia(agent: agent, tone: tone),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        agent.name,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.aiAccentSoft,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: colors.aiAccent.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        child: Text(
                          'AI',
                          style: TextStyle(
                            color: colors.aiAccent,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  agent.description,
                  style: TextStyle(color: colors.textSecondary, height: 1.35),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final tag in tags)
                      Chip(
                        label: Text(tag),
                        visualDensity: VisualDensity.compact,
                        backgroundColor: tag == tags.first
                            ? colors.accentSoft
                            : colors.surfaceMuted,
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: onOpen,
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Open chat'),
                ),
                const SizedBox(height: 8),
                Text(
                  'Provider processed only when you send.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: colors.textTertiary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class PersonaCatalogueCard extends StatelessWidget {
  const PersonaCatalogueCard({
    required this.persona,
    required this.onEdit,
    required this.onOpen,
    super.key,
  });

  final AiPersona persona;
  final VoidCallback onEdit;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    return CouncilPanel(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(14),
      onTap: onOpen,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AiContactAvatar(name: persona.name, custom: true, radius: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        persona.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    CouncilPill(
                      label: persona.archived ? 'Archived' : 'Persona',
                      icon: persona.archived
                          ? Icons.archive_outlined
                          : Icons.auto_awesome,
                      ai: !persona.archived,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  persona.archived
                      ? 'History remains available. Restore before generating.'
                      : persona.description,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: colors.textSecondary, height: 1.35),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    CouncilPill(label: persona.tone),
                    CouncilPill(label: persona.verbosity),
                    TextButton.icon(
                      onPressed: onEdit,
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('Edit'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AgentMedia extends StatelessWidget {
  const _AgentMedia({required this.agent, required this.tone});
  final AiAgent agent;
  final _AgentTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    final stops = switch (tone) {
      _AgentTone.creative => const [
        Color(0xFFEADDFF),
        Color(0xFFF3F2FF),
        Colors.white,
      ],
      _AgentTone.study => const [
        Color(0xFFDBE1FF),
        Color(0xFFF3F2FF),
        Colors.white,
      ],
      _AgentTone.code => const [
        Color(0xFFE1E1F0),
        Color(0xFFF3F2FF),
        Colors.white,
      ],
      _AgentTone.research => const [
        Color(0xFFDBE1FF),
        Color(0xFFE2DFFF),
        Colors.white,
      ],
      _AgentTone.general => [
        colors.accentSoft,
        colors.surfaceMuted,
        Colors.white,
      ],
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: stops,
        ),
      ),
      child: Stack(
        children: [
          Center(
            child: Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.78),
                shape: BoxShape.circle,
                border: Border.all(color: colors.border.withValues(alpha: 0.5)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 32,
                    offset: const Offset(0, 16),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: _AgentPortrait(agent: agent),
            ),
          ),
          Positioned(
            top: 10,
            right: 10,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.88),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withValues(alpha: 0.66)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.auto_awesome, size: 13, color: colors.aiAccent),
                    const SizedBox(width: 4),
                    Text(
                      'AI',
                      style: TextStyle(
                        color: colors.aiAccent,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AgentPortrait extends StatelessWidget {
  const _AgentPortrait({required this.agent});
  final AiAgent agent;

  @override
  Widget build(BuildContext context) {
    final avatar = agent.avatarKey;
    if (avatar != null &&
        (avatar.startsWith('https://') || avatar.startsWith('http://'))) {
      return Image.network(avatar, fit: BoxFit.cover);
    }
    return Center(
      child: Text(
        agent.name.characters.first.toUpperCase(),
        style: TextStyle(
          color: context.councilColors.aiAccent,
          fontSize: 34,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

enum _AgentTone { creative, study, code, research, general }

_AgentTone _agentTone(AiAgent agent) {
  final text = '${agent.slug} ${agent.name} ${agent.description}'.toLowerCase();
  if (text.contains('writing') || text.contains('editor')) {
    return _AgentTone.creative;
  }
  if (text.contains('study') ||
      text.contains('coach') ||
      text.contains('learn')) {
    return _AgentTone.study;
  }
  if (text.contains('code') ||
      text.contains('coding') ||
      text.contains('developer')) {
    return _AgentTone.code;
  }
  if (text.contains('research') || text.contains('fact')) {
    return _AgentTone.research;
  }
  return _AgentTone.general;
}

List<String> _agentTags(_AgentTone tone) => switch (tone) {
  _AgentTone.creative => const ['Creative', 'Precise'],
  _AgentTone.study => const ['Educational', 'Patient'],
  _AgentTone.code => const ['Technical', 'Logic'],
  _AgentTone.research => const ['Research', 'Verified'],
  _AgentTone.general => const ['Generalist', 'Fast'],
};

class AiConversationScreen extends ConsumerStatefulWidget {
  const AiConversationScreen({required this.conversationId, super.key});
  final String conversationId;
  @override
  ConsumerState<AiConversationScreen> createState() =>
      _AiConversationScreenState();
}

class _AiConversationScreenState extends ConsumerState<AiConversationScreen> {
  final composer = TextEditingController();
  StreamSubscription<AiStreamEvent>? stream;
  String partial = '';
  String? pendingUserText;
  String? pendingClientMessageId;
  String? error;

  @override
  void initState() {
    super.initState();
    _loadDraft();
  }

  Future<void> _loadDraft() async {
    final user = ref.read(authUserProvider).value;
    if (user == null) return;
    final draft = await ref
        .read(localStoreProvider)
        .readDraft(user.id, 'ai', widget.conversationId);
    if (draft != null && mounted) composer.text = draft;
  }

  @override
  void dispose() {
    stream?.cancel();
    final user = ref.read(authUserProvider).value;
    if (user != null) {
      unawaited(
        ref
            .read(localStoreProvider)
            .writeDraft(user.id, 'ai', widget.conversationId, composer.text),
      );
    }
    composer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(aiMessagesProvider(widget.conversationId));
    final conversation = ref.watch(
      aiConversationProvider(widget.conversationId),
    );
    final settings = ref.watch(settingsProvider).value;
    final generating = stream != null;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: AiConversationTitle(
          conversation: conversation.value,
          isTyping: generating,
        ),
        actions: [
          IconButton(
            tooltip: 'Memory',
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) =>
                  MemorySheet(conversationId: widget.conversationId),
            ),
            icon: const Icon(Icons.psychology_alt_outlined),
          ),
          IconButton(
            tooltip: 'Delete AI chat',
            onPressed: () async {
              await ref
                  .read(aiRepositoryProvider)
                  .deleteAiConversation(widget.conversationId);
              if (context.mounted) context.pop();
            },
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
      body: Column(
        children: [
          if (error != null) ErrorBanner(error!),
          Expanded(
            child: SharedChatBackground(
              background: settings?.chatBackground ?? 'clean',
              child: messages.when(
                data: (items) {
                  final showPendingUser =
                      pendingUserText != null &&
                      !items.any(
                        (message) =>
                            message.clientMessageId == pendingClientMessageId,
                      );
                  return ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      for (final message in items)
                        AiMessageRow(
                          role: message.role,
                          content: message.content,
                        ),
                      if (showPendingUser)
                        AiMessageRow(
                          role: 'user',
                          content: pendingUserText!,
                          pending: true,
                          footer: 'Sending',
                        ),
                      if (generating && partial.isEmpty) const AiTypingRow(),
                      if (partial.isNotEmpty)
                        AiMessageRow(
                          role: 'assistant',
                          content: partial,
                          pending: true,
                        ),
                    ],
                  );
                },
                error: (e, _) => ErrorBanner(AppError.from(e).message),
                loading: () => const Center(child: CircularProgressIndicator()),
              ),
            ),
          ),
          if (generating) AiTypingStatus(streaming: partial.isNotEmpty),
          AiComposerBar(
            controller: composer,
            generating: generating,
            onSend: _send,
            onStop: () {
              stream?.cancel();
              setState(() => stream = null);
            },
          ),
        ],
      ),
    );
  }

  void _send() {
    final text = composer.text.trim();
    if (text.isEmpty || stream != null) return;
    final clientMessageId = const Uuid().v4();
    composer.clear();
    setState(() {
      error = null;
      partial = '';
      pendingUserText = text;
      pendingClientMessageId = clientMessageId;
    });
    stream = ref
        .read(aiRepositoryProvider)
        .streamMessage(
          conversationId: widget.conversationId,
          content: text,
          clientMessageId: clientMessageId,
        )
        .listen(
          (event) {
            if (event is AiStreamDelta) setState(() => partial += event.text);
            if (event is AiStreamDone || event is AiStreamError) {
              setState(() {
                stream = null;
                partial = '';
                pendingUserText = null;
                pendingClientMessageId = null;
              });
              ref.invalidate(aiMessagesProvider(widget.conversationId));
              ref.invalidate(aiConversationProvider(widget.conversationId));
              ref.invalidate(aiConversationsProvider);
            }
            if (event is AiStreamError) {
              setState(() => error = 'AI generation failed: ${event.category}');
            }
          },
          onError: (Object e) => setState(() {
            error = AppError.from(e).message;
            stream = null;
          }),
          onDone: () => setState(() => stream = null),
        );
  }
}

class AiConversationTitle extends StatelessWidget {
  const AiConversationTitle({
    required this.conversation,
    required this.isTyping,
    super.key,
  });

  final AiConversation? conversation;
  final bool isTyping;

  @override
  Widget build(BuildContext context) {
    final name = conversation?.displayName ?? 'Assistant';
    final custom = conversation?.kind == 'custom';
    return Row(
      children: [
        AiContactAvatar(
          name: name,
          avatarKey: conversation?.avatarKey,
          custom: custom,
          radius: 18,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                isTyping
                    ? 'typing...'
                    : custom
                    ? 'Custom persona'
                    : 'AI contact',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: isTyping
                      ? context.councilColors.aiAccent
                      : context.councilColors.textSecondary,
                  fontWeight: isTyping ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class AiContactAvatar extends StatelessWidget {
  const AiContactAvatar({
    required this.name,
    this.avatarKey,
    this.custom = false,
    this.radius = 20,
    super.key,
  });

  final String name;
  final String? avatarKey;
  final bool custom;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    final image =
        avatarKey != null &&
        (avatarKey!.startsWith('https://') || avatarKey!.startsWith('http://'));
    return CircleAvatar(
      radius: radius,
      backgroundColor: custom ? colors.accentSoft : colors.aiAccentSoft,
      foregroundColor: custom ? colors.messageOutgoing : colors.aiAccent,
      child: image
          ? ClipOval(
              child: Image.network(
                avatarKey!,
                width: radius * 2,
                height: radius * 2,
                fit: BoxFit.cover,
              ),
            )
          : Text(name.characters.first.toUpperCase()),
    );
  }
}

class AiMessageRow extends StatelessWidget {
  const AiMessageRow({
    required this.role,
    required this.content,
    this.pending = false,
    this.footer,
    super.key,
  });

  final String role;
  final String content;
  final bool pending;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final user = role == 'user';
    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * (user ? 0.82 : 0.86),
        ),
        child: AiMessageBubble(
          role: role,
          content: content,
          pending: pending,
          footer: footer,
        ),
      ),
    );
  }
}

class AiTypingRow extends StatelessWidget {
  const AiTypingRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.72,
        ),
        child: const AiTypingBubble(),
      ),
    );
  }
}

class AiTypingStatus extends StatelessWidget {
  const AiTypingStatus({required this.streaming, super.key});
  final bool streaming;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Row(
        children: [
          Icon(
            Icons.auto_awesome,
            size: 14,
            color: context.councilColors.aiAccent,
          ),
          const SizedBox(width: 6),
          Text(
            streaming ? 'Typing...' : 'Thinking...',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: context.councilColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class AiComposerBar extends StatelessWidget {
  const AiComposerBar({
    required this.controller,
    required this.generating,
    required this.onSend,
    required this.onStop,
    super.key,
  });

  final TextEditingController controller;
  final bool generating;
  final VoidCallback onSend;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border.all(
              color: context.councilColors.border.withValues(alpha: 0.55),
            ),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              children: [
                IconButton(
                  tooltip: 'Attach image',
                  onPressed: () =>
                      ImagePicker().pickImage(source: ImageSource.gallery),
                  icon: const Icon(Icons.image_outlined),
                ),
                IconButton(
                  tooltip: 'Attach document',
                  onPressed: () => FilePicker.platform.pickFiles(
                    type: FileType.custom,
                    allowedExtensions: const ['pdf', 'txt', 'md', 'markdown'],
                  ),
                  icon: const Icon(Icons.description_outlined),
                ),
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      hintText: 'Message',
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      filled: false,
                      contentPadding: EdgeInsets.symmetric(vertical: 12),
                    ),
                    textInputAction: TextInputAction.newline,
                  ),
                ),
                generating
                    ? IconButton.filledTonal(
                        tooltip: 'Stop generation',
                        onPressed: onStop,
                        icon: const Icon(Icons.stop),
                      )
                    : IconButton.filled(
                        tooltip: 'Send',
                        onPressed: onSend,
                        icon: const Icon(Icons.send),
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AiTypingBubble extends StatelessWidget {
  const AiTypingBubble({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: colors.aiAccentSoft,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(8),
          topRight: Radius.circular(18),
          bottomLeft: Radius.circular(18),
          bottomRight: Radius.circular(18),
        ),
        border: Border.all(color: colors.aiAccent.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const _TypingDots(),
          const SizedBox(width: 8),
          Text(
            'Thinking...',
            style: TextStyle(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TypingDots extends StatelessWidget {
  const _TypingDots();

  @override
  Widget build(BuildContext context) {
    final color = context.councilColors.aiAccent;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var index = 0; index < 3; index += 1)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 1.5),
            child: Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ),
      ],
    );
  }
}

class AiMessageBubble extends StatelessWidget {
  const AiMessageBubble({
    required this.role,
    required this.content,
    this.pending = false,
    this.footer,
    super.key,
  });

  final String role;
  final String content;
  final bool pending;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    final user = role == 'user';
    return Opacity(
      opacity: pending ? 0.78 : 1,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: user ? colors.messageOutgoing : colors.aiAccentSoft,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(user ? 18 : 8),
            topRight: Radius.circular(user ? 8 : 18),
            bottomLeft: const Radius.circular(18),
            bottomRight: const Radius.circular(18),
          ),
          border: Border.all(
            color: user
                ? colors.messageOutgoing
                : colors.aiAccent.withValues(alpha: 0.22),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            user
                ? Text(
                    content,
                    style: TextStyle(
                      color: colors.messageOutgoingText,
                      height: 1.45,
                    ),
                  )
                : SafeMarkdown(content),
            if (footer != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  footer!,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: user ? Colors.white70 : colors.textTertiary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class PersonaEditorScreen extends ConsumerStatefulWidget {
  const PersonaEditorScreen({this.personaId, super.key});
  final String? personaId;
  @override
  ConsumerState<PersonaEditorScreen> createState() =>
      _PersonaEditorScreenState();
}

class _PersonaEditorScreenState extends ConsumerState<PersonaEditorScreen> {
  final name = TextEditingController();
  final description = TextEditingController();
  final instructions = TextEditingController();
  String tone = 'balanced';
  String verbosity = 'balanced';
  String? error;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.personaId == null ? 'New persona' : 'Edit persona'),
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (error != null) ErrorBanner(error!),
        TextField(
          controller: name,
          decoration: const InputDecoration(labelText: 'Name'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: description,
          decoration: const InputDecoration(labelText: 'Description'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: instructions,
          minLines: 5,
          maxLines: 10,
          decoration: const InputDecoration(labelText: 'Instructions'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField(
          initialValue: tone,
          decoration: const InputDecoration(labelText: 'Tone'),
          items: const ['warm', 'balanced', 'direct', 'playful', 'formal']
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => setState(() => tone = value ?? tone),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField(
          initialValue: verbosity,
          decoration: const InputDecoration(labelText: 'Verbosity'),
          items: const ['concise', 'balanced', 'detailed']
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => setState(() => verbosity = value ?? verbosity),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _save,
          icon: const Icon(Icons.save_outlined),
          label: const Text('Save'),
        ),
      ],
    ),
  );

  Future<void> _save() async {
    try {
      await ref
          .read(aiRepositoryProvider)
          .savePersona(
            id: widget.personaId,
            name: name.text,
            description: description.text,
            instructions: instructions.text,
            tone: tone,
            verbosity: verbosity,
          );
      ref.invalidate(personasProvider);
      if (mounted) context.pop();
    } catch (e) {
      setState(() => error = AppError.from(e).message);
    }
  }
}

class MemorySheet extends ConsumerStatefulWidget {
  const MemorySheet({required this.conversationId, super.key});
  final String conversationId;
  @override
  ConsumerState<MemorySheet> createState() => _MemorySheetState();
}

class _MemorySheetState extends ConsumerState<MemorySheet> {
  final memory = TextEditingController();
  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      builder: (context, controller) {
        final memories = ref.watch(
          FutureProvider((ref) {
            return ref
                .watch(aiRepositoryProvider)
                .listMemories(widget.conversationId);
          }),
        );
        return ListView(
          controller: controller,
          padding: const EdgeInsets.all(16),
          children: [
            Text('AI memory', style: Theme.of(context).textTheme.titleLarge),
            const Text(
              'Memories are explicit and saved only after confirmation.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: memory,
              decoration: const InputDecoration(labelText: 'New memory'),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: () async {
                if (memory.text.trim().isEmpty) return;
                await ref
                    .read(aiRepositoryProvider)
                    .createMemory(
                      widget.conversationId,
                      'other',
                      memory.text.trim(),
                    );
                memory.clear();
                setState(() {});
              },
              icon: const Icon(Icons.add),
              label: const Text('Add memory'),
            ),
            memories.when(
              data: (items) => Column(
                children: items
                    .map(
                      (item) => ListTile(
                        title: Text(item.content),
                        subtitle: Text(item.category),
                      ),
                    )
                    .toList(),
              ),
              error: (e, _) => ErrorBanner(AppError.from(e).message),
              loading: () => const LinearProgressIndicator(),
            ),
          ],
        );
      },
    );
  }
}
