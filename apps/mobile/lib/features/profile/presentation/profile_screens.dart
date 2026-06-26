import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/council_theme.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/notifications/local_notifications.dart';
import '../../../core/persistence/local_store.dart';
import '../../../core/widgets/chat_background.dart';
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
            FadeSlideIn(
              child: CouncilPanel(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 34,
                      child: Text(
                        (profile?.label ?? 'C').characters.first.toUpperCase(),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            profile?.label ?? 'Council user',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            profile?.username == null
                                ? 'Complete your profile'
                                : '@${profile!.username}',
                            style: TextStyle(
                              color: context.councilColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip: 'Edit profile',
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Profile editing uses the account settings contract.',
                          ),
                        ),
                      ),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            CouncilSection(
              title: 'Settings',
              subtitle: 'Account, privacy, access, and local preferences.',
              children: [
                CouncilListTile(
                  leading: const Icon(Icons.palette_outlined),
                  title: 'Appearance',
                  subtitle: 'Theme and chat background',
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/profile/appearance'),
                ),
                CouncilListTile(
                  leading: const Icon(Icons.visibility_outlined),
                  title: 'Privacy',
                  subtitle: 'Online and last-seen visibility',
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/profile/privacy'),
                ),
                CouncilListTile(
                  leading: const Icon(Icons.notifications_outlined),
                  title: 'Notifications',
                  subtitle: 'Previews, sound, and permission state',
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/profile/notifications'),
                ),
                CouncilListTile(
                  leading: const Icon(Icons.verified_outlined),
                  title: 'Premium access',
                  subtitle: 'Trial, Premium credits, and owner-issued codes',
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/profile/access'),
                ),
                CouncilListTile(
                  leading: const Icon(Icons.block),
                  title: 'Blocked users',
                  subtitle: 'Private block list and unblock controls',
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/profile/blocked'),
                ),
              ],
            ),
            CouncilListTile(
              leading: Icon(Icons.logout, color: context.councilColors.danger),
              title: 'Sign out',
              subtitle:
                  'Clears user-scoped drafts, queues, and notification state.',
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                final userId = ref.read(authUserProvider).value?.id;
                if (userId != null) {
                  await ref.read(localStoreProvider).clearUser(userId);
                }
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
        CouncilSection(
          title: 'Theme',
          subtitle: 'Matches the web light, dark, and system modes.',
          children: [
            for (final theme in ['system', 'light', 'dark'])
              CouncilListTile(
                leading: Icon(_themeIcon(theme)),
                title: _settingLabel(theme),
                subtitle: theme == 'system'
                    ? 'Follow the operating system'
                    : 'Use ${_settingLabel(theme).toLowerCase()} appearance',
                selected: currentTheme == theme,
                trailing: currentTheme == theme
                    ? const Icon(Icons.check_circle)
                    : null,
                onTap: () => _updateTheme(ref, theme),
              ),
          ],
        ),
        CouncilSection(
          title: 'Chat background',
          subtitle: 'Used by human and AI message histories.',
          children: [
            for (final background in ['clean', 'grid', 'paper', 'midnight'])
              _BackgroundOption(
                background: background,
                selected: currentBackground == background,
                onTap: () => _updateBackground(ref, background),
              ),
          ],
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

class _BackgroundOption extends StatelessWidget {
  const _BackgroundOption({
    required this.background,
    required this.selected,
    required this.onTap,
  });

  final String background;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => CouncilPanel(
    selected: selected,
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(10),
    onTap: onTap,
    child: Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            width: 72,
            height: 52,
            child: SharedChatBackground(
              background: background,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Align(
                  alignment: Alignment.bottomRight,
                  child: Container(
                    width: 34,
                    height: 14,
                    decoration: BoxDecoration(
                      color: context.councilColors.messageOutgoing,
                      borderRadius: BorderRadius.circular(9),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _settingLabel(background),
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 3),
              Text(
                AppearanceSettingsScreen._backgroundDescription(background),
                style: TextStyle(color: context.councilColors.textSecondary),
              ),
            ],
          ),
        ),
        if (selected) const Icon(Icons.check_circle),
      ],
    ),
  );
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
        CouncilPanel(
          margin: const EdgeInsets.only(bottom: 10),
          padding: EdgeInsets.zero,
          child: SwitchListTile(
            value: showOnline,
            onChanged: (value) =>
                _updatePrivacy(ref, {'show_online_status': value}),
            title: const Text('Show online status'),
            subtitle: const Text('Controls presence visibility where allowed.'),
            secondary: const Icon(Icons.circle_outlined),
          ),
        ),
        CouncilPanel(
          padding: EdgeInsets.zero,
          child: SwitchListTile(
            value: showLastSeen,
            onChanged: (value) =>
                _updatePrivacy(ref, {'show_last_seen': value}),
            title: const Text('Show last seen'),
            subtitle: const Text('Keeps last-seen private when disabled.'),
            secondary: const Icon(Icons.schedule_outlined),
          ),
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
        CouncilPanel(
          margin: const EdgeInsets.only(bottom: 10),
          padding: EdgeInsets.zero,
          child: SwitchListTile(
            value: _boolSetting(notifications, 'message_notifications', true),
            onChanged: (value) =>
                _updateNotifications(ref, {'message_notifications': value}),
            title: const Text('Message notifications'),
            secondary: const Icon(Icons.notifications_outlined),
          ),
        ),
        CouncilPanel(
          margin: const EdgeInsets.only(bottom: 10),
          padding: EdgeInsets.zero,
          child: SwitchListTile(
            value: _boolSetting(notifications, 'message_previews', false),
            onChanged: (value) =>
                _updateNotifications(ref, {'message_previews': value}),
            title: const Text('Message previews'),
            subtitle: const Text(
              'When disabled, notifications use generic text.',
            ),
            secondary: const Icon(Icons.preview_outlined),
          ),
        ),
        CouncilPanel(
          padding: EdgeInsets.zero,
          child: SwitchListTile(
            value: _boolSetting(notifications, 'sound', true),
            onChanged: (value) => _updateNotifications(ref, {'sound': value}),
            title: const Text('Sound'),
            secondary: const Icon(Icons.volume_up_outlined),
          ),
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
            data: (value) => CouncilPanel(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.verified_outlined,
                    color: value.isPro
                        ? Theme.of(context).colorScheme.primary
                        : context.councilColors.textSecondary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          value.isPro
                              ? 'Premium active'
                              : 'Trial or free account',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            CouncilPill(
                              label: 'Premium ${value.proCreditsRemaining}',
                              icon: Icons.auto_awesome,
                              ai: true,
                            ),
                            CouncilPill(
                              label: 'Trial ${value.trialCreditsRemaining}',
                              icon: Icons.bolt_outlined,
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Access codes are manually issued. There is no automatic renewal or payment.',
                          style: TextStyle(
                            color: context.councilColors.textSecondary,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            error: (e, _) => ErrorBanner(AppError.from(e).message),
            loading: () => const LinearProgressIndicator(),
          ),
          const SizedBox(height: 12),
          CouncilPanel(
            child: TextField(
              controller: code,
              decoration: const InputDecoration(labelText: 'Access code'),
            ),
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
