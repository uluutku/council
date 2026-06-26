import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/authentication/presentation/auth_screens.dart';
import '../features/ai/presentation/ai_screens.dart';
import '../features/artifacts/presentation/artifact_screens.dart';
import '../features/contacts/presentation/contact_screens.dart';
import '../features/messaging/presentation/messaging_screens.dart';
import '../features/profile/presentation/profile_screens.dart';
import '../features/shared/data/council_repositories.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/chats',
    refreshListenable: _RouterRefresh(ref),
    redirect: (context, state) {
      final user = ref.read(authUserProvider).value;
      final profile = ref.read(currentProfileProvider).value;
      final guest = {
        '/login',
        '/register',
        '/verify-email',
        '/forgot-password',
        '/reset-password',
      }.contains(state.uri.path);
      if (user == null) return guest ? null : '/login';
      if (profile != null &&
          !profile.onboardingComplete &&
          state.uri.path != '/onboarding') {
        return '/onboarding';
      }
      if (guest) return '/chats';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(
        path: '/verify-email',
        builder: (_, _) => const VerifyEmailScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (_, _) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (_, _) => const ResetPasswordScreen(),
      ),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => CouncilShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/chats',
                builder: (_, _) => const InboxScreen(),
                routes: [
                  GoRoute(
                    path: 'search',
                    builder: (_, _) => const MessageSearchScreen(),
                  ),
                  GoRoute(
                    path: ':conversationId',
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (_, state) => ConversationScreen(
                      conversationId: state.pathParameters['conversationId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/ai',
                builder: (_, _) => const AiHomeScreen(),
                routes: [
                  GoRoute(
                    path: 'personas/new',
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (_, _) => const PersonaEditorScreen(),
                  ),
                  GoRoute(
                    path: 'personas/:personaId/edit',
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (_, state) => PersonaEditorScreen(
                      personaId: state.pathParameters['personaId'],
                    ),
                  ),
                  GoRoute(
                    path: ':conversationId',
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (_, state) => AiConversationScreen(
                      conversationId: state.pathParameters['conversationId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/contacts',
                builder: (_, _) => const ContactsScreen(),
                routes: [
                  GoRoute(
                    path: 'discover',
                    builder: (_, _) => const DiscoverContactsScreen(),
                  ),
                  GoRoute(
                    path: 'requests',
                    builder: (_, _) => const ContactRequestsScreen(),
                  ),
                  GoRoute(
                    path: 'blocked',
                    builder: (_, _) => const BlockedUsersScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/artifacts',
                builder: (_, _) => const ArtifactsScreen(),
                routes: [
                  GoRoute(
                    path: ':artifactId',
                    parentNavigatorKey: _rootNavigatorKey,
                    builder: (_, state) => ArtifactWorkspaceScreen(
                      artifactId: state.pathParameters['artifactId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                builder: (_, _) => const ProfileScreen(),
                routes: [
                  GoRoute(
                    path: 'appearance',
                    builder: (_, _) => const AppearanceSettingsScreen(),
                  ),
                  GoRoute(
                    path: 'privacy',
                    builder: (_, _) => const PrivacySettingsScreen(),
                  ),
                  GoRoute(
                    path: 'notifications',
                    builder: (_, _) => const NotificationSettingsScreen(),
                  ),
                  GoRoute(
                    path: 'access',
                    builder: (_, _) => const AccessSettingsScreen(),
                  ),
                  GoRoute(
                    path: 'blocked',
                    builder: (_, _) => const BlockedUsersScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(this.ref) {
    ref.listen(authUserProvider, (_, __) => notifyListeners());
    ref.listen(currentProfileProvider, (_, __) => notifyListeners());
  }
  final Ref ref;
}

class CouncilShell extends StatelessWidget {
  const CouncilShell({required this.shell, super.key});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 720;
    final destinations = const [
      NavigationDestination(
        icon: Icon(Icons.chat_bubble_outline),
        label: 'Chats',
      ),
      NavigationDestination(
        icon: Icon(Icons.auto_awesome_outlined),
        label: 'AI',
      ),
      NavigationDestination(
        icon: Icon(Icons.people_outline),
        label: 'Contacts',
      ),
      NavigationDestination(
        icon: Icon(Icons.article_outlined),
        label: 'Artifacts',
      ),
      NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
    ];
    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: shell.currentIndex,
              onDestinationSelected: shell.goBranch,
              labelType: NavigationRailLabelType.all,
              destinations: destinations
                  .map(
                    (d) => NavigationRailDestination(
                      icon: d.icon,
                      label: Text(d.label),
                    ),
                  )
                  .toList(),
            ),
            const VerticalDivider(width: 1),
            Expanded(child: shell),
          ],
        ),
      );
    }
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: shell.goBranch,
        destinations: destinations,
      ),
    );
  }
}
