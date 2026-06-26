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
            onPressed: () => context.push('/contacts/discover'),
            icon: const Icon(Icons.person_search),
          ),
          IconButton(
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
            : ListView(
                children: items
                    .map(
                      (contact) => ListTile(
                        leading: CircleAvatar(
                          child: Text(
                            contact.label.characters.first.toUpperCase(),
                          ),
                        ),
                        title: Text(contact.label),
                        subtitle: Text(
                          contact.statusText ?? '@${contact.username}',
                        ),
                        onTap: () async {
                          final id = await ref
                              .read(messagingRepositoryProvider)
                              .createOrGetDirect(contact.id);
                          if (context.mounted) context.push('/chats/$id');
                        },
                        trailing: PopupMenuButton<String>(
                          onSelected: (value) async {
                            if (value == 'remove')
                              await ref
                                  .read(contactsRepositoryProvider)
                                  .remove(contact.id);
                            if (value == 'block')
                              await ref
                                  .read(contactsRepositoryProvider)
                                  .block(contact.id);
                            ref.invalidate(contactsProvider);
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
                    )
                    .toList(),
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
        SearchBar(
          controller: query,
          leading: const Icon(Icons.search),
          hintText: 'Search by username',
          onChanged: _queueSearch,
          onSubmitted: (_) => _search(),
        ),
        const SizedBox(height: 12),
        if (loading) const LinearProgressIndicator(),
        if (!loading && lastQuery.trim().length < 2)
          const ListTile(
            leading: Icon(Icons.person_search),
            title: Text('Type at least 2 characters'),
            subtitle: Text('Search is privacy-bounded by the backend.'),
          ),
        if (!loading && lastQuery.trim().length >= 2 && results.isEmpty)
          const ListTile(
            leading: Icon(Icons.search_off),
            title: Text('No matching users'),
            subtitle: Text('Try a username or display name.'),
          ),
        for (final contact in results)
          Card(
            child: ListTile(
              leading: CircleAvatar(
                child: Text(contact.label.characters.first.toUpperCase()),
              ),
              title: Text(contact.label),
              subtitle: Text(
                [
                  '@${contact.username}',
                  if (contact.statusText?.isNotEmpty == true)
                    contact.statusText!,
                ].join('\n'),
              ),
              isThreeLine: contact.statusText?.isNotEmpty == true,
              trailing: FilledButton.tonal(
                onPressed: () async {
                  await ref
                      .read(contactsRepositoryProvider)
                      .sendRequest(contact.id);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Request sent.')),
                    );
                  }
                },
                child: const Text('Request'),
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
        data: (items) => ListView(
          children: items
              .map(
                (request) => ListTile(
                  title: Text(request.label),
                  subtitle: Text(request.direction),
                  trailing: request.direction == 'incoming'
                      ? Wrap(
                          spacing: 8,
                          children: [
                            IconButton(
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
                      : const Text('Pending'),
                ),
              )
              .toList(),
        ),
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class BlockedUsersScreen extends StatelessWidget {
  const BlockedUsersScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Blocked users')),
    body: const EmptyState(
      icon: Icons.block,
      title: 'Blocked users',
      body:
          'Blocked-user management uses the private list_my_blocked_users backend contract.',
    ),
  );
}
