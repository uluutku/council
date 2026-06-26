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
            Text('Settings', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.palette_outlined),
              title: const Text('Appearance'),
              subtitle: const Text('Theme and chat background'),
              onTap: () => context.push('/profile/appearance'),
            ),
            ListTile(
              leading: const Icon(Icons.visibility_outlined),
              title: const Text('Privacy'),
              subtitle: const Text('Online and last-seen visibility'),
              onTap: () => context.push('/profile/privacy'),
            ),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Notifications'),
              subtitle: const Text('Previews, sound, and permission state'),
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
    final settings = ref.watch(settingsProvider);
    final currentTheme = settings.value?.theme ?? 'system';
    final currentBackground = settings.value?.chatBackground ?? 'clean';
    return SettingsScaffold(
      title: 'Appearance',
      children: [
        if (settings.isLoading) const LinearProgressIndicator(),
        Text('Theme', style: Theme.of(context).textTheme.titleMedium),
        for (final theme in ['system', 'light', 'dark'])
          RadioListTile<String>(
            value: theme,
            groupValue: currentTheme,
            title: Text(_settingLabel(theme)),
            secondary: Icon(_themeIcon(theme)),
            onChanged: (value) => _updateTheme(ref, value),
          ),
        const Divider(),
        Text('Chat background', style: Theme.of(context).textTheme.titleMedium),
        for (final background in ['clean', 'grid', 'paper', 'midnight'])
          RadioListTile<String>(
            value: background,
            groupValue: currentBackground,
            title: Text(_settingLabel(background)),
            subtitle: Text(_backgroundDescription(background)),
            secondary: const Icon(Icons.wallpaper_outlined),
            onChanged: (value) => _updateBackground(ref, value),
          ),
      ],
    );
  }

  static Future<void> _updateTheme(WidgetRef ref, String? theme) async {
    if (theme == null) return;
    await ref.read(accountRepositoryProvider).updateSettings(theme: theme);
    ref.invalidate(settingsProvider);
  }

  static Future<void> _updateBackground(
    WidgetRef ref,
    String? background,
  ) async {
    if (background == null) return;
    await ref
        .read(accountRepositoryProvider)
        .updateSettings(appearance: {'chat_background': background});
    ref.invalidate(settingsProvider);
  }

  static IconData _themeIcon(String theme) => switch (theme) {
    'light' => Icons.light_mode_outlined,
    'dark' => Icons.dark_mode_outlined,
    _ => Icons.brightness_auto_outlined,
  };

  static String _backgroundDescription(String background) =>
      switch (background) {
        'grid' => 'Subtle Council grid',
        'paper' => 'Soft paper texture',
        'midnight' => 'Deep low-light surface',
        _ => 'Clean elevated surface',
      };
}

class PrivacySettingsScreen extends ConsumerWidget {
  const PrivacySettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final privacy = settings.value?.privacyPreferences ?? const {};
    final showOnline = _boolSetting(privacy, 'show_online_status', true);
    final showLastSeen = _boolSetting(privacy, 'show_last_seen', true);
    return SettingsScaffold(
      title: 'Privacy',
      children: [
        if (settings.isLoading) const LinearProgressIndicator(),
        SwitchListTile(
          value: showOnline,
          onChanged: (value) =>
              _updatePrivacy(ref, {'show_online_status': value}),
          title: const Text('Show online status'),
          subtitle: const Text('Controls presence visibility where allowed.'),
        ),
        SwitchListTile(
          value: showLastSeen,
          onChanged: (value) => _updatePrivacy(ref, {'show_last_seen': value}),
          title: const Text('Show last seen'),
          subtitle: const Text('Keeps last-seen private when disabled.'),
        ),
      ],
    );
  }

  static Future<void> _updatePrivacy(
    WidgetRef ref,
    Map<String, dynamic> value,
  ) async {
    await ref.read(accountRepositoryProvider).updateSettings(privacy: value);
    ref.invalidate(settingsProvider);
  }
}

class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final notifications = settings.value?.notificationPreferences ?? const {};
    return SettingsScaffold(
      title: 'Notifications',
      children: [
        if (settings.isLoading) const LinearProgressIndicator(),
        SwitchListTile(
          value: _boolSetting(notifications, 'message_notifications', true),
          onChanged: (value) =>
              _updateNotifications(ref, {'message_notifications': value}),
          title: const Text('Message notifications'),
        ),
        SwitchListTile(
          value: _boolSetting(notifications, 'message_previews', false),
          onChanged: (value) =>
              _updateNotifications(ref, {'message_previews': value}),
          title: const Text('Message previews'),
          subtitle: const Text(
            'When disabled, notifications use generic text.',
          ),
        ),
        SwitchListTile(
          value: _boolSetting(notifications, 'sound', true),
          onChanged: (value) => _updateNotifications(ref, {'sound': value}),
          title: const Text('Sound'),
        ),
      ],
    );
  }

  static Future<void> _updateNotifications(
    WidgetRef ref,
    Map<String, dynamic> value,
  ) async {
    await ref
        .read(accountRepositoryProvider)
        .updateSettings(notifications: value);
    ref.invalidate(settingsProvider);
  }
}

class AccessSettingsScreen extends ConsumerStatefulWidget {
  const AccessSettingsScreen({super.key});
  @override
  ConsumerState<AccessSettingsScreen> createState() =>
      _AccessSettingsScreenState();
}

bool _boolSetting(Map<String, dynamic> source, String key, bool fallback) {
  final value = source[key];
  return value is bool ? value : fallback;
}

String _settingLabel(String value) {
  if (value.isEmpty) return value;
  return '${value.characters.first.toUpperCase()}${value.substring(1)}';
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
