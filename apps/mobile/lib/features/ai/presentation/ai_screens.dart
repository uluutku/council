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
              Card(
                child: ListTile(
                  leading: const Icon(Icons.verified_outlined),
                  title: Text(access.isPro ? 'Premium access' : 'Trial access'),
                  subtitle: Text(
                    'Premium credits ${access.proCreditsRemaining}. Trial credits ${access.trialCreditsRemaining}.',
                  ),
                ),
              ),
            const SizedBox(height: 12),
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
              data: (items) => Column(
                children: items
                    .map(
                      (persona) => Card(
                        child: ListTile(
                          leading: const CircleAvatar(
                            child: Icon(Icons.person_4_outlined),
                          ),
                          title: Text(persona.name),
                          subtitle: Text(
                            persona.archived ? 'Archived' : persona.description,
                          ),
                          trailing: IconButton(
                            tooltip: 'Edit persona',
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () =>
                                context.push('/ai/personas/${persona.id}/edit'),
                          ),
                          onTap: persona.archived
                              ? null
                              : () async {
                                  final convo = await ref
                                      .read(aiRepositoryProvider)
                                      .openConversation(personaId: persona.id);
                                  ref.invalidate(aiConversationsProvider);
                                  if (context.mounted)
                                    context.push('/ai/${convo.id}');
                                },
                        ),
                      ),
                    )
                    .toList(),
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI conversation'),
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
            child: messages.when(
              data: (items) => ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  for (final message in items)
                    Align(
                      alignment: message.role == 'user'
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * 0.86,
                        ),
                        child: AiMessageBubble(
                          role: message.role,
                          content: message.content,
                        ),
                      ),
                    ),
                  if (partial.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * 0.86,
                        ),
                        child: AiMessageBubble(
                          role: 'assistant',
                          content: partial,
                          pending: true,
                        ),
                      ),
                    ),
                ],
              ),
              error: (e, _) => ErrorBanner(AppError.from(e).message),
              loading: () => const Center(child: CircularProgressIndicator()),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(12),
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
                      controller: composer,
                      minLines: 1,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        hintText: 'Ask this AI contact',
                      ),
                    ),
                  ),
                  stream == null
                      ? IconButton.filled(
                          tooltip: 'Send',
                          onPressed: _send,
                          icon: const Icon(Icons.send),
                        )
                      : IconButton.filledTonal(
                          tooltip: 'Stop generation',
                          onPressed: () {
                            stream?.cancel();
                            setState(() => stream = null);
                          },
                          icon: const Icon(Icons.stop),
                        ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _send() {
    final text = composer.text.trim();
    if (text.isEmpty) return;
    composer.clear();
    setState(() {
      error = null;
      partial = '';
    });
    stream = ref
        .read(aiRepositoryProvider)
        .streamMessage(
          conversationId: widget.conversationId,
          content: text,
          clientMessageId: const Uuid().v4(),
        )
        .listen(
          (event) {
            if (event is AiStreamDelta) setState(() => partial += event.text);
            if (event is AiStreamDone || event is AiStreamError) {
              setState(() {
                stream = null;
                partial = '';
              });
              ref.invalidate(aiMessagesProvider(widget.conversationId));
            }
            if (event is AiStreamError)
              setState(() => error = 'AI generation failed: ${event.category}');
          },
          onError: (Object e) => setState(() {
            error = AppError.from(e).message;
            stream = null;
          }),
          onDone: () => setState(() => stream = null),
        );
  }
}

class AiMessageBubble extends StatelessWidget {
  const AiMessageBubble({
    required this.role,
    required this.content,
    this.pending = false,
    super.key,
  });

  final String role;
  final String content;
  final bool pending;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    final user = role == 'user';
    return Opacity(
      opacity: pending ? 0.72 : 1,
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
        child: user
            ? Text(
                content,
                style: TextStyle(
                  color: colors.messageOutgoingText,
                  height: 1.45,
                ),
              )
            : SafeMarkdown(content),
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
          value: tone,
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
          value: verbosity,
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
