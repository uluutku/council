import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../app/theme/council_theme.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/persistence/local_store.dart';
import '../../../core/widgets/common.dart';
import '../../ai/presentation/ai_screens.dart';
import '../../shared/data/council_repositories.dart';
import '../../shared/domain/council_models.dart';

final conversationsProvider = FutureProvider<List<ConversationSummary>>((ref) {
  return ref.watch(messagingRepositoryProvider).listConversations();
});

final messagesProvider = FutureProvider.family<List<Message>, String>((
  ref,
  conversationId,
) {
  return ref.watch(messagingRepositoryProvider).listMessages(conversationId);
});

enum InboxFilter { all, unread, muted }

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});
  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  InboxFilter filter = InboxFilter.all;
  RealtimeChannel? channel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _subscribeInbox());
  }

  void _subscribeInbox() {
    final userId = ref.read(authUserProvider).value?.id;
    if (userId == null) return;
    channel?.unsubscribe();
    channel = ref
        .read(messagingRepositoryProvider)
        .subscribeInbox(userId, () => ref.invalidate(conversationsProvider));
  }

  @override
  void dispose() {
    channel?.unsubscribe();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final conversations = ref.watch(conversationsProvider);
    final aiConversations = ref.watch(aiConversationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chats'),
        actions: [
          IconButton(
            tooltip: 'Search messages',
            onPressed: () => context.push('/chats/search'),
            icon: const Icon(Icons.search),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SegmentedButton<InboxFilter>(
              segments: const [
                ButtonSegment(value: InboxFilter.all, label: Text('All')),
                ButtonSegment(value: InboxFilter.unread, label: Text('Unread')),
                ButtonSegment(value: InboxFilter.muted, label: Text('Muted')),
              ],
              selected: {filter},
              onSelectionChanged: (value) =>
                  setState(() => filter = value.first),
            ),
          ),
          Expanded(
            child: conversations.when(
              data: (items) {
                final filtered = items.where((item) {
                  return switch (filter) {
                    InboxFilter.all => true,
                    InboxFilter.unread => item.unreadCount > 0,
                    InboxFilter.muted => item.isMuted,
                  };
                }).toList();
                final aiItems = filter == InboxFilter.all
                    ? aiConversations.value ?? const <AiConversation>[]
                    : const <AiConversation>[];
                if (filtered.isEmpty && aiItems.isEmpty) {
                  return const EmptyState(
                    icon: Icons.chat_bubble_outline,
                    title: 'No conversations',
                    body: 'Accepted contacts and AI histories appear here.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(conversationsProvider);
                    ref.invalidate(aiConversationsProvider);
                  },
                  child: ListView(
                    children: [
                      if (filtered.isNotEmpty)
                        const _InboxSectionHeader(label: 'Human chats'),
                      for (final item in filtered)
                        HumanConversationTile(item: item),
                      if (aiItems.isNotEmpty)
                        const _InboxSectionHeader(label: 'AI chats'),
                      if (aiConversations.isLoading &&
                          filter == InboxFilter.all)
                        const LinearProgressIndicator(),
                      for (final item in aiItems)
                        AiConversationTile(conversation: item),
                      if (aiConversations.hasError && filter == InboxFilter.all)
                        ErrorBanner(
                          AppError.from(aiConversations.error!).message,
                        ),
                    ],
                  ),
                );
              },
              error: (error, _) => ErrorBanner(AppError.from(error).message),
              loading: () => const Center(child: CircularProgressIndicator()),
            ),
          ),
        ],
      ),
    );
  }
}

class _InboxSectionHeader extends StatelessWidget {
  const _InboxSectionHeader({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
    child: Text(
      label,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
        color: context.councilColors.textSecondary,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

class HumanConversationTile extends StatelessWidget {
  const HumanConversationTile({required this.item, super.key});
  final ConversationSummary item;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: CircleAvatar(
      child: Text(item.peerLabel.characters.first.toUpperCase()),
    ),
    title: Text(item.peerLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
    subtitle: Text(
      item.preview ?? 'Attachment',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    ),
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (item.isMuted)
          const Icon(Icons.notifications_off_outlined, size: 18),
        if (item.unreadCount > 0) Badge(label: Text('${item.unreadCount}')),
      ],
    ),
    onTap: () => context.push('/chats/${item.id}'),
  );
}

class AiConversationTile extends StatelessWidget {
  const AiConversationTile({required this.conversation, super.key});
  final AiConversation conversation;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    final kind = conversation.kind == 'custom' ? 'Custom' : 'AI';
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: conversation.kind == 'custom'
            ? colors.accentSoft
            : colors.aiAccentSoft,
        foregroundColor: conversation.kind == 'custom'
            ? colors.messageOutgoing
            : colors.aiAccent,
        child:
            conversation.avatarKey != null &&
                (conversation.avatarKey!.startsWith('https://') ||
                    conversation.avatarKey!.startsWith('http://'))
            ? ClipOval(
                child: Image.network(
                  conversation.avatarKey!,
                  width: 40,
                  height: 40,
                  fit: BoxFit.cover,
                ),
              )
            : Text(conversation.displayName.characters.first.toUpperCase()),
      ),
      title: Text(
        conversation.displayName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Row(
        children: [
          Expanded(
            child: Text(
              conversation.description?.trim().isNotEmpty == true
                  ? conversation.description!.trim()
                  : 'Online',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          DecoratedBox(
            decoration: BoxDecoration(
              color: conversation.kind == 'custom'
                  ? colors.accentSoft
                  : colors.aiAccentSoft,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              child: Text(
                kind,
                style: TextStyle(
                  color: conversation.kind == 'custom'
                      ? colors.messageOutgoing
                      : colors.aiAccent,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
            ),
          ),
        ],
      ),
      onTap: () => context.push('/ai/${conversation.id}'),
    );
  }
}

class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({required this.conversationId, super.key});
  final String conversationId;
  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final composer = TextEditingController();
  RealtimeChannel? channel;
  String? replyTo;
  String? error;

  @override
  void initState() {
    super.initState();
    _loadDraft();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      channel = ref
          .read(messagingRepositoryProvider)
          .subscribeConversation(
            widget.conversationId,
            () => ref.invalidate(messagesProvider(widget.conversationId)),
          );
    });
  }

  Future<void> _loadDraft() async {
    final user = ref.read(authUserProvider).value;
    if (user == null) return;
    final draft = await ref
        .read(localStoreProvider)
        .readDraft(user.id, 'human', widget.conversationId);
    if (draft != null && mounted) composer.text = draft;
  }

  @override
  void dispose() {
    channel?.unsubscribe();
    unawaited(_persistDraft());
    composer.dispose();
    super.dispose();
  }

  Future<void> _persistDraft() async {
    final user = ref.read(authUserProvider).value;
    if (user == null) return;
    await ref
        .read(localStoreProvider)
        .writeDraft(user.id, 'human', widget.conversationId, composer.text);
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(messagesProvider(widget.conversationId));
    final myId = ref.watch(authUserProvider).value?.id;
    final settings = ref.watch(settingsProvider).value;
    final conversation = _findConversation(
      ref.watch(conversationsProvider).value,
      widget.conversationId,
    );
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: HumanConversationTitle(conversation: conversation),
        actions: [
          IconButton(
            tooltip: 'Mute',
            onPressed: () => ref
                .read(messagingRepositoryProvider)
                .mute(widget.conversationId, forever: true),
            icon: const Icon(Icons.notifications_off_outlined),
          ),
          PopupMenuButton<String>(
            onSelected: (value) async {
              if (value == 'delete') {
                await ref
                    .read(messagingRepositoryProvider)
                    .deleteForMe(widget.conversationId);
                if (context.mounted) context.pop();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'delete',
                child: Text('Delete from my view'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (error != null) ErrorBanner(error!),
          Expanded(
            child: ChatBackground(
              background: settings?.chatBackground ?? 'clean',
              child: messages.when(
                data: (items) {
                  if (items.isNotEmpty) {
                    unawaited(
                      ref
                          .read(messagingRepositoryProvider)
                          .markRead(widget.conversationId, items.last.sequence),
                    );
                  }
                  return ListView.builder(
                    reverse: false,
                    padding: const EdgeInsets.all(12),
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final message = items[index];
                      final mine = message.senderUserId == myId;
                      return Align(
                        alignment: mine
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: GestureDetector(
                          onLongPress: () => _showMessageActions(message),
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
                            ),
                            child: MessageBubble(message: message, mine: mine),
                          ),
                        ),
                      );
                    },
                  );
                },
                error: (error, _) => ErrorBanner(AppError.from(error).message),
                loading: () => const Center(child: CircularProgressIndicator()),
              ),
            ),
          ),
          if (replyTo != null)
            ListTile(
              dense: true,
              leading: const Icon(Icons.reply),
              title: const Text('Replying to selected message'),
              trailing: IconButton(
                onPressed: () => setState(() => replyTo = null),
                icon: const Icon(Icons.close),
              ),
            ),
          SafeArea(
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
                        tooltip: 'Attach file',
                        onPressed: _pickAttachment,
                        icon: const Icon(Icons.attach_file),
                      ),
                      Expanded(
                        child: TextField(
                          controller: composer,
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
                      IconButton.filled(
                        tooltip: 'Send',
                        onPressed: _send,
                        icon: const Icon(Icons.send),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _send() async {
    final content = composer.text.trim();
    if (content.isEmpty) return;
    final clientId = const Uuid().v4();
    final repo = ref.read(messagingRepositoryProvider);
    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.contains(ConnectivityResult.none)) {
        final user = ref.read(authUserProvider).value;
        if (user != null) {
          final store = ref.read(localStoreProvider);
          final queue = await store.readQueue(user.id);
          queue.add({
            'conversation_id': widget.conversationId,
            'client_message_id': clientId,
            'content': content,
            'reply_to_message_id': replyTo,
          });
          await store.writeQueue(user.id, queue);
        }
      } else {
        await repo.sendText(
          conversationId: widget.conversationId,
          clientMessageId: clientId,
          content: content,
          replyToMessageId: replyTo,
        );
      }
      composer.clear();
      setState(() => replyTo = null);
      ref.invalidate(messagesProvider(widget.conversationId));
    } catch (e) {
      setState(() => error = AppError.from(e).message);
    }
  }

  Future<void> _pickAttachment() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'gif',
        'pdf',
        'txt',
        'md',
        'markdown',
      ],
    );
    if (result != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Attachment upload uses the private staged backend flow.',
          ),
        ),
      );
    }
  }

  void _showMessageActions(Message message) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.reply),
              title: const Text('Reply'),
              onTap: () {
                setState(() => replyTo = message.id);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.auto_awesome),
              title: const Text('Forward to AI'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Delete'),
              onTap: () async {
                Navigator.pop(context);
                await ref
                    .read(messagingRepositoryProvider)
                    .deleteMessage(message.id);
                ref.invalidate(messagesProvider(widget.conversationId));
              },
            ),
          ],
        ),
      ),
    );
  }
}

ConversationSummary? _findConversation(
  List<ConversationSummary>? conversations,
  String conversationId,
) {
  if (conversations == null) return null;
  for (final conversation in conversations) {
    if (conversation.id == conversationId) return conversation;
  }
  return null;
}

class HumanConversationTitle extends StatelessWidget {
  const HumanConversationTitle({required this.conversation, super.key});

  final ConversationSummary? conversation;

  @override
  Widget build(BuildContext context) {
    final label = conversation?.peerLabel ?? 'Contact';
    return Row(
      children: [
        CircleAvatar(
          radius: 18,
          child: Text(label.characters.first.toUpperCase()),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                'Direct message',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: context.councilColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class ChatBackground extends StatelessWidget {
  const ChatBackground({
    required this.background,
    required this.child,
    super.key,
  });
  final String background;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = switch ((background, dark)) {
      ('midnight', true) => const Color(0xFF030405),
      ('midnight', false) => const Color(0xFFF2F3F8),
      ('grid', true) => const Color(0xFF07090D),
      ('grid', false) => const Color(0xFFF9F8FF),
      ('paper', true) => const Color(0xFF080A0E),
      ('paper', false) => const Color(0xFFFBFAFF),
      _ => Theme.of(context).colorScheme.surface,
    };
    return DecoratedBox(
      decoration: BoxDecoration(color: base),
      child: CustomPaint(
        painter: _ChatBackgroundPainter(background: background, dark: dark),
        child: child,
      ),
    );
  }
}

class _ChatBackgroundPainter extends CustomPainter {
  const _ChatBackgroundPainter({required this.background, required this.dark});
  final String background;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..strokeWidth = 1
      ..color = (dark ? Colors.white : const Color(0xFF3525CD)).withValues(
        alpha: dark ? 0.07 : 0.055,
      );
    if (background == 'grid' || background == 'midnight') {
      const step = 32.0;
      for (var x = 0.0; x < size.width; x += step) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
      }
      for (var y = 0.0; y < size.height; y += step) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      }
    }
    if (background == 'paper') {
      paint.color = (dark ? Colors.white : const Color(0xFF777587)).withValues(
        alpha: dark ? 0.045 : 0.08,
      );
      for (var y = 22.0; y < size.height; y += 28) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ChatBackgroundPainter oldDelegate) {
    return oldDelegate.background != background || oldDelegate.dark != dark;
  }
}

class MessageBubble extends StatelessWidget {
  const MessageBubble({required this.message, required this.mine, super.key});
  final Message message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final colors = context.councilColors;
    final textColor = mine
        ? colors.messageOutgoingText
        : Theme.of(context).colorScheme.onSurface;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
      decoration: BoxDecoration(
        color: mine ? colors.messageOutgoing : colors.messageIncoming,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(mine ? 18 : 8),
          topRight: Radius.circular(mine ? 8 : 18),
          bottomLeft: const Radius.circular(18),
          bottomRight: const Radius.circular(18),
        ),
        border: Border.all(
          color: mine ? colors.messageOutgoing : colors.messageIncomingBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (message.isDeleted)
            Text(
              'Message deleted',
              style: TextStyle(
                color: mine ? Colors.white70 : colors.textTertiary,
                fontStyle: FontStyle.italic,
              ),
            )
          else ...[
            if (message.replyToMessageId != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  'Reply',
                  style: TextStyle(
                    color: mine ? Colors.white70 : colors.textTertiary,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            if (message.content != null)
              Text(
                message.content!,
                style: TextStyle(color: textColor, height: 1.45),
              ),
            for (final attachment in message.attachments)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Chip(
                  avatar: const Icon(Icons.attach_file, size: 16),
                  label: Text(attachment.filename),
                  visualDensity: VisualDensity.compact,
                ),
              ),
          ],
          if (message.editedAt != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Edited',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: mine ? Colors.white70 : colors.textTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class MessageSearchScreen extends StatelessWidget {
  const MessageSearchScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Message search')),
    body: const EmptyState(
      icon: Icons.search,
      title: 'Search is backend-backed',
      body:
          'Use conversation and message search through the existing bounded RPCs.',
    ),
  );
}
