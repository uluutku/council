import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/widgets/common.dart';
import '../../shared/data/council_repositories.dart';
import '../../shared/domain/council_models.dart';

final contactsProvider = FutureProvider<List<Contact>>(
  (ref) => ref.watch(contactsRepositoryProvider).listContacts(),
);
final requestsProvider = FutureProvider<List<ContactRequest>>(
  (ref) => ref.watch(contactsRepositoryProvider).listRequests(),
);
final blockedUsersProvider = FutureProvider<List<BlockedUser>>(
  (ref) => ref.watch(contactsRepositoryProvider).listBlockedUsers(),
);

class ContactsScreen extends ConsumerWidget {
  const ContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contacts = ref.watch(contactsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contacts'),
        actions: [
          IconButton(
            tooltip: 'Discover users',
            onPressed: () => context.push('/contacts/discover'),
            icon: const Icon(Icons.person_search),
          ),
          IconButton(
            tooltip: 'Requests',
            onPressed: () => context.push('/contacts/requests'),
            icon: const Icon(Icons.inbox_outlined),
          ),
        ],
      ),
      body: contacts.when(
        data: (items) => items.isEmpty
            ? const EmptyState(
                icon: Icons.people_outline,
                title: 'No contacts yet',
                body: 'Find people by username and send a contact request.',
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(contactsProvider),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length + 1,
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return const CouncilSection(
                        title: 'Accepted contacts',
                        subtitle: 'Human conversations with realtime delivery.',
                        children: [],
                      );
                    }
                    final contact = items[index - 1];
                    return FadeSlideIn(
                      delay: Duration(milliseconds: 22 * index),
                      child: CouncilListTile(
                        leading: _ContactAvatar(label: contact.label),
                        title: contact.label,
                        subtitle: contact.statusText ?? '@${contact.username}',
                        onTap: () async {
                          final id = await ref
                              .read(messagingRepositoryProvider)
                              .createOrGetDirect(contact.id);
                          if (context.mounted) context.push('/chats/$id');
                        },
                        trailing: PopupMenuButton<String>(
                          tooltip: 'Contact actions',
                          onSelected: (value) async {
                            if (value == 'remove') {
                              await ref
                                  .read(contactsRepositoryProvider)
                                  .remove(contact.id);
                            }
                            if (value == 'block') {
                              await ref
                                  .read(contactsRepositoryProvider)
                                  .block(contact.id);
                            }
                            ref.invalidate(contactsProvider);
                            ref.invalidate(blockedUsersProvider);
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(
                              value: 'remove',
                              child: Text('Remove contact'),
                            ),
                            PopupMenuItem(value: 'block', child: Text('Block')),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class DiscoverContactsScreen extends ConsumerStatefulWidget {
  const DiscoverContactsScreen({super.key});

  @override
  ConsumerState<DiscoverContactsScreen> createState() =>
      _DiscoverContactsScreenState();
}

class _DiscoverContactsScreenState
    extends ConsumerState<DiscoverContactsScreen> {
  final query = TextEditingController();
  List<Contact> results = const [];
  Timer? debounce;
  String? error;
  bool loading = false;
  String lastQuery = '';

  @override
  void dispose() {
    debounce?.cancel();
    query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Discover')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (error != null) ErrorBanner(error!),
        CouncilPanel(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          child: SearchBar(
            controller: query,
            leading: const Icon(Icons.search),
            hintText: 'Search by username',
            elevation: const WidgetStatePropertyAll(0),
            backgroundColor: const WidgetStatePropertyAll(Colors.transparent),
            onChanged: _queueSearch,
            onSubmitted: (_) => _search(),
          ),
        ),
        const SizedBox(height: 12),
        if (loading) const LinearProgressIndicator(),
        if (!loading && lastQuery.trim().length < 2)
          const CouncilListTile(
            leading: Icon(Icons.person_search),
            title: 'Type at least 2 characters',
            subtitle: 'Search is privacy-bounded by the backend.',
          ),
        if (!loading && lastQuery.trim().length >= 2 && results.isEmpty)
          const CouncilListTile(
            leading: Icon(Icons.search_off),
            title: 'No matching users',
            subtitle: 'Try a username or display name.',
          ),
        for (final contact in results)
          FadeSlideIn(
            child: CouncilListTile(
              leading: _ContactAvatar(label: contact.label),
              title: contact.label,
              subtitle: [
                '@${contact.username}',
                if (contact.statusText?.isNotEmpty == true) contact.statusText!,
              ].join('\n'),
              trailing: IconButton.filledTonal(
                tooltip: 'Send request',
                onPressed: () async {
                  await ref
                      .read(contactsRepositoryProvider)
                      .sendRequest(contact.id);
                  ref.invalidate(requestsProvider);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Request sent.')),
                    );
                  }
                },
                icon: const Icon(Icons.person_add_alt_1_outlined),
              ),
            ),
          ),
      ],
    ),
  );

  void _queueSearch(String value) {
    lastQuery = value;
    debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        results = const [];
        error = null;
        loading = false;
      });
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    debounce = Timer(const Duration(milliseconds: 280), _search);
  }

  Future<void> _search() async {
    final current = query.text.trim();
    lastQuery = current;
    if (current.length < 2) {
      setState(() {
        results = const [];
        loading = false;
        error = null;
      });
      return;
    }
    try {
      final found = await ref.read(contactsRepositoryProvider).search(current);
      if (!mounted || current != query.text.trim()) return;
      setState(() {
        results = found;
        error = null;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = AppError.from(e).message;
        loading = false;
      });
    }
  }
}

class ContactRequestsScreen extends ConsumerWidget {
  const ContactRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(requestsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Requests')),
      body: requests.when(
        data: (items) => items.isEmpty
            ? const EmptyState(
                icon: Icons.inbox_outlined,
                title: 'No requests',
                body: 'Incoming and outgoing requests will appear here.',
              )
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final request = items[index];
                  return FadeSlideIn(
                    delay: Duration(milliseconds: index * 22),
                    child: CouncilListTile(
                      leading: _ContactAvatar(label: request.label),
                      title: request.label,
                      subtitle: request.direction == 'incoming'
                          ? 'Wants to connect'
                          : 'Request pending',
                      trailing: request.direction == 'incoming'
                          ? Wrap(
                              spacing: 6,
                              children: [
                                IconButton.filledTonal(
                                  tooltip: 'Accept',
                                  onPressed: () async {
                                    await ref
                                        .read(contactsRepositoryProvider)
                                        .respond(
                                          request.relationshipId,
                                          'accepted',
                                        );
                                    ref.invalidate(requestsProvider);
                                    ref.invalidate(contactsProvider);
                                  },
                                  icon: const Icon(Icons.check),
                                ),
                                IconButton(
                                  tooltip: 'Reject',
                                  onPressed: () async {
                                    await ref
                                        .read(contactsRepositoryProvider)
                                        .respond(
                                          request.relationshipId,
                                          'rejected',
                                        );
                                    ref.invalidate(requestsProvider);
                                  },
                                  icon: const Icon(Icons.close),
                                ),
                              ],
                            )
                          : const CouncilPill(label: 'Pending'),
                    ),
                  );
                },
              ),
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class BlockedUsersScreen extends ConsumerWidget {
  const BlockedUsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blocked = ref.watch(blockedUsersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Blocked users')),
      body: blocked.when(
        data: (items) => items.isEmpty
            ? const EmptyState(
                icon: Icons.block,
                title: 'No blocked users',
                body: 'People you block are listed privately here.',
              )
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final user = items[index];
                  return FadeSlideIn(
                    delay: Duration(milliseconds: index * 22),
                    child: CouncilListTile(
                      leading: _ContactAvatar(label: user.label),
                      title: user.label,
                      subtitle: '@${user.username}',
                      trailing: FilledButton.tonalIcon(
                        onPressed: () async {
                          await ref
                              .read(contactsRepositoryProvider)
                              .unblock(user.id);
                          ref.invalidate(blockedUsersProvider);
                          ref.invalidate(contactsProvider);
                        },
                        icon: const Icon(Icons.lock_open_outlined),
                        label: const Text('Unblock'),
                      ),
                    ),
                  );
                },
              ),
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class _ContactAvatar extends StatelessWidget {
  const _ContactAvatar({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) =>
      CircleAvatar(child: Text(label.characters.first.toUpperCase()));
}
