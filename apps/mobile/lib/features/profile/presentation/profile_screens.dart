import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/notifications/local_notifications.dart';
import '../../../core/persistence/local_store.dart';
import '../../../core/widgets/common.dart';
import '../../ai/presentation/ai_screens.dart';
import '../../shared/data/council_repositories.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(currentProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: profile.when(
        data: (profile) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            CircleAvatar(
              radius: 36,
              child: Text(
                (profile?.label ?? 'C').characters.first.toUpperCase(),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              profile?.label ?? 'Council user',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
            ListTile(
              leading: const Icon(Icons.palette_outlined),
              title: const Text('Appearance'),
              onTap: () => context.push('/profile/appearance'),
            ),
            ListTile(
              leading: const Icon(Icons.visibility_outlined),
              title: const Text('Privacy'),
              onTap: () => context.push('/profile/privacy'),
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Notifications'),
              onTap: () => context.push('/profile/notifications'),
            ),
            ListTile(
              leading: const Icon(Icons.verified_outlined),
              title: const Text('Premium access'),
              onTap: () => context.push('/profile/access'),
            ),
            ListTile(
              leading: const Icon(Icons.block),
              title: const Text('Blocked users'),
              onTap: () => context.push('/profile/blocked'),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Sign out'),
              onTap: () async {
                final userId = ref.read(authUserProvider).value?.id;
                if (userId != null)
                  await ref.read(localStoreProvider).clearUser(userId);
                LocalNotifications.instance.clearDeduplication();
                await ref.read(authRepositoryProvider).signOut();
                if (context.mounted) context.go('/login');
              },
            ),
          ],
        ),
        error: (e, _) => ErrorBanner(AppError.from(e).message),
        loading: () => const Center(child: CircularProgressIndicator()),
      ),
    );
  }
}

class AppearanceSettingsScreen extends ConsumerWidget {
  const AppearanceSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SettingsScaffold(
      title: 'Appearance',
      children: [
        for (final theme in ['system', 'light', 'dark'])
          ListTile(
            title: Text(theme),
            leading: const Icon(Icons.brightness_6_outlined),
            onTap: () async {
              await ref
                  .read(accountRepositoryProvider)
                  .updateSettings(theme: theme);
              ref.invalidate(settingsProvider);
            },
          ),
        const Divider(),
        for (final background in ['clean', 'grid', 'paper', 'midnight'])
          ListTile(
            title: Text(background),
            leading: const Icon(Icons.wallpaper_outlined),
            onTap: () async {
              await ref
                  .read(accountRepositoryProvider)
                  .updateSettings(appearance: {'chat_background': background});
              ref.invalidate(settingsProvider);
            },
          ),
      ],
    );
  }
}

class PrivacySettingsScreen extends ConsumerWidget {
  const PrivacySettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => SettingsScaffold(
    title: 'Privacy',
    children: [
      SwitchListTile(
        value: true,
        onChanged: (value) => ref
            .read(accountRepositoryProvider)
            .updateSettings(privacy: {'show_online_status': value}),
        title: const Text('Show online status'),
      ),
      SwitchListTile(
        value: true,
        onChanged: (value) => ref
            .read(accountRepositoryProvider)
            .updateSettings(privacy: {'show_last_seen': value}),
        title: const Text('Show last seen'),
      ),
    ],
  );
}

class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => SettingsScaffold(
    title: 'Notifications',
    children: [
      SwitchListTile(
        value: true,
        onChanged: (value) => ref
            .read(accountRepositoryProvider)
            .updateSettings(notifications: {'message_notifications': value}),
        title: const Text('Message notifications'),
      ),
      SwitchListTile(
        value: true,
        onChanged: (value) => ref
            .read(accountRepositoryProvider)
            .updateSettings(notifications: {'message_previews': value}),
        title: const Text('Message previews'),
      ),
      SwitchListTile(
        value: true,
        onChanged: (value) => ref
            .read(accountRepositoryProvider)
            .updateSettings(notifications: {'sound': value}),
        title: const Text('Sound'),
      ),
    ],
  );
}

class AccessSettingsScreen extends ConsumerStatefulWidget {
  const AccessSettingsScreen({super.key});
  @override
  ConsumerState<AccessSettingsScreen> createState() =>
      _AccessSettingsScreenState();
}

class _AccessSettingsScreenState extends ConsumerState<AccessSettingsScreen> {
  final code = TextEditingController();
  String? status;
  @override
  Widget build(BuildContext context) {
    final access = ref.watch(aiAccessProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Premium access')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          access.when(
            data: (value) => Card(
              child: ListTile(
                leading: const Icon(Icons.verified_outlined),
                title: Text(
                  value.isPro ? 'Premium active' : 'Trial or free account',
                ),
                subtitle: Text(
                  'Premium credits: ${value.proCreditsRemaining}. Trial credits: ${value.trialCreditsRemaining}. Codes are manually issued. There is no automatic renewal or payment.',
                ),
              ),
            ),
            error: (e, _) => ErrorBanner(AppError.from(e).message),
            loading: () => const LinearProgressIndicator(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: code,
            decoration: const InputDecoration(labelText: 'Access code'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () async {
              try {
                await ref.read(accessRepositoryProvider).redeem(code.text);
                ref.invalidate(aiAccessProvider);
                setState(() => status = 'Code redeemed.');
              } catch (e) {
                setState(() => status = AppError.from(e).message);
              }
            },
            icon: const Icon(Icons.redeem),
            label: const Text('Redeem code'),
          ),
          if (status != null)
            Padding(padding: const EdgeInsets.all(12), child: Text(status!)),
        ],
      ),
    );
  }
}

class SettingsScaffold extends StatelessWidget {
  const SettingsScaffold({
    required this.title,
    required this.children,
    super.key,
  });
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: ListView(padding: const EdgeInsets.all(16), children: children),
  );
}
