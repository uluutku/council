import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/persistence/local_store.dart';
import '../../../core/widgets/common.dart';
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
                if (filtered.isEmpty) {
                  return const EmptyState(
                    icon: Icons.chat_bubble_outline,
                    title: 'No conversations',
                    body: 'Accepted contacts and AI histories appear here.',
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(conversationsProvider),
                  child: ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = filtered[index];
                      return ListTile(
                        leading: CircleAvatar(
                          child: Text(
                            item.peerLabel.characters.first.toUpperCase(),
                          ),
                        ),
                        title: Text(
                          item.peerLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          item.preview ?? 'Attachment',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (item.isMuted)
                              const Icon(
                                Icons.notifications_off_outlined,
                                size: 18,
                              ),
                            if (item.unreadCount > 0)
                              Badge(label: Text('${item.unreadCount}')),
                          ],
                        ),
                        onTap: () => context.push('/chats/${item.id}'),
                      );
                    },
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Conversation'),
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
                          child: Card(
                            color: mine
                                ? Theme.of(context).colorScheme.primary
                                : null,
                            child: Padding(
                              padding: const EdgeInsets.all(10),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (message.isDeleted)
                                    Text(
                                      'Message deleted',
                                      style: TextStyle(
                                        color: mine ? Colors.white70 : null,
                                      ),
                                    )
                                  else ...[
                                    if (message.replyToMessageId != null)
                                      Text(
                                        'Reply',
                                        style: TextStyle(
                                          color: mine ? Colors.white70 : null,
                                        ),
                                      ),
                                    if (message.content != null)
                                      Text(
                                        message.content!,
                                        style: TextStyle(
                                          color: mine ? Colors.white : null,
                                        ),
                                      ),
                                    for (final attachment
                                        in message.attachments)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 6),
                                        child: Chip(
                                          avatar: const Icon(
                                            Icons.attach_file,
                                            size: 16,
                                          ),
                                          label: Text(attachment.filename),
                                        ),
                                      ),
                                  ],
                                  if (message.editedAt != null)
                                    Text(
                                      'Edited',
                                      style: Theme.of(
                                        context,
                                      ).textTheme.labelSmall,
                                    ),
                                ],
                              ),
                            ),
                          ),
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
                      decoration: const InputDecoration(hintText: 'Message'),
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
