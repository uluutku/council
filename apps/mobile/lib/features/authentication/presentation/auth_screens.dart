import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/widgets/common.dart';
import '../../shared/data/council_repositories.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  String? error;
  var busy = false;

  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Sign in to Council',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        TextField(
          controller: email,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy ? null : _submit,
          icon: const Icon(Icons.login),
          label: const Text('Sign in'),
        ),
        TextButton(
          onPressed: () => context.go('/forgot-password'),
          child: const Text('Forgot password'),
        ),
        TextButton(
          onPressed: () => context.go('/register'),
          child: const Text('Create an account'),
        ),
      ],
    ),
  );

  Future<void> _submit() async {
    setState(() => busy = true);
    try {
      await ref.read(authRepositoryProvider).signIn(email.text, password.text);
      if (mounted) context.go('/chats');
    } catch (e) {
      setState(() => error = AppError.from(e).message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});
  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  String? error;
  var busy = false;

  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Create Council account',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        TextField(
          controller: email,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Password'),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: busy ? null : _submit,
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('Register'),
        ),
        TextButton(
          onPressed: () => context.go('/login'),
          child: const Text('Already registered'),
        ),
      ],
    ),
  );

  Future<void> _submit() async {
    setState(() => busy = true);
    try {
      await ref
          .read(authRepositoryProvider)
          .register(email.text, password.text);
      if (mounted) context.go('/verify-email');
    } catch (e) {
      setState(() => error = AppError.from(e).message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key});
  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final email = TextEditingController();
  String? status;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Verify your email',
    child: Column(
      children: [
        TextField(
          controller: email,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        FilledButton.tonalIcon(
          onPressed: () async {
            await ref
                .read(authRepositoryProvider)
                .resendVerification(email.text);
            setState(() => status = 'Verification email sent.');
          },
          icon: const Icon(Icons.mark_email_unread_outlined),
          label: const Text('Resend verification'),
        ),
        if (status != null)
          Padding(padding: const EdgeInsets.all(12), child: Text(status!)),
        TextButton(
          onPressed: () => context.go('/login'),
          child: const Text('Back to sign in'),
        ),
      ],
    ),
  );
}

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final email = TextEditingController();
  String? status;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Reset password',
    child: Column(
      children: [
        TextField(
          controller: email,
          decoration: const InputDecoration(labelText: 'Email'),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () async {
            await ref.read(authRepositoryProvider).forgotPassword(email.text);
            setState(
              () => status = 'If an account exists, a reset email was sent.',
            );
          },
          icon: const Icon(Icons.lock_reset),
          label: const Text('Send reset link'),
        ),
        if (status != null)
          Padding(padding: const EdgeInsets.all(12), child: Text(status!)),
      ],
    ),
  );
}

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key});
  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final password = TextEditingController();
  String? error;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Choose a new password',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        TextField(
          controller: password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'New password'),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () async {
            try {
              await ref
                  .read(authRepositoryProvider)
                  .resetPassword(password.text);
              if (context.mounted) context.go('/chats');
            } catch (e) {
              setState(() => error = AppError.from(e).message);
            }
          },
          icon: const Icon(Icons.check),
          label: const Text('Update password'),
        ),
      ],
    ),
  );
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final username = TextEditingController();
  final displayName = TextEditingController();
  String? error;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Finish your profile',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        TextField(
          controller: username,
          decoration: const InputDecoration(labelText: 'Username'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: displayName,
          decoration: const InputDecoration(labelText: 'Display name'),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: () async {
            try {
              await ref
                  .read(accountRepositoryProvider)
                  .setProfile(
                    username: username.text,
                    displayName: displayName.text,
                  );
              ref.invalidate(currentProfileProvider);
              if (context.mounted) context.go('/chats');
            } catch (e) {
              setState(() => error = AppError.from(e).message);
            }
          },
          icon: const Icon(Icons.shield_outlined),
          label: const Text('Enter Council'),
        ),
      ],
    ),
  );
}

class AuthScaffold extends StatelessWidget {
  const AuthScaffold({required this.title, required this.child, super.key});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: AsyncPane(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.shield_outlined,
                  size: 48,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                child,
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
