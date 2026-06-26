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
  final emailFocus = FocusNode();
  final passwordFocus = FocusNode();
  String? error;
  var busy = false;

  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Sign in to Council',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        AuthTextField(
          controller: email,
          focusNode: emailFocus,
          label: 'Email',
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.next,
          onSubmitted: (_) => passwordFocus.requestFocus(),
        ),
        const SizedBox(height: 12),
        AuthTextField(
          controller: password,
          focusNode: passwordFocus,
          label: 'Password',
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
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

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    emailFocus.dispose();
    passwordFocus.dispose();
    super.dispose();
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
  final emailFocus = FocusNode();
  final passwordFocus = FocusNode();
  String? error;
  var busy = false;

  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Create Council account',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        AuthTextField(
          controller: email,
          focusNode: emailFocus,
          label: 'Email',
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.next,
          onSubmitted: (_) => passwordFocus.requestFocus(),
        ),
        const SizedBox(height: 12),
        AuthTextField(
          controller: password,
          focusNode: passwordFocus,
          label: 'Password',
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
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

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    emailFocus.dispose();
    passwordFocus.dispose();
    super.dispose();
  }
}

class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key});
  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final email = TextEditingController();
  final emailFocus = FocusNode();
  String? status;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Verify your email',
    child: Column(
      children: [
        AuthTextField(
          controller: email,
          focusNode: emailFocus,
          label: 'Email',
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
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

  @override
  void dispose() {
    email.dispose();
    emailFocus.dispose();
    super.dispose();
  }
}

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final email = TextEditingController();
  final emailFocus = FocusNode();
  String? status;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Reset password',
    child: Column(
      children: [
        AuthTextField(
          controller: email,
          focusNode: emailFocus,
          label: 'Email',
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.done,
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

  @override
  void dispose() {
    email.dispose();
    emailFocus.dispose();
    super.dispose();
  }
}

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key});
  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final password = TextEditingController();
  final passwordFocus = FocusNode();
  String? error;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Choose a new password',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        AuthTextField(
          controller: password,
          focusNode: passwordFocus,
          label: 'New password',
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          textInputAction: TextInputAction.done,
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

  @override
  void dispose() {
    password.dispose();
    passwordFocus.dispose();
    super.dispose();
  }
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final username = TextEditingController();
  final displayName = TextEditingController();
  final usernameFocus = FocusNode();
  final displayNameFocus = FocusNode();
  String? error;
  @override
  Widget build(BuildContext context) => AuthScaffold(
    title: 'Finish your profile',
    child: Column(
      children: [
        if (error != null) ErrorBanner(error!),
        AuthTextField(
          controller: username,
          focusNode: usernameFocus,
          label: 'Username',
          keyboardType: TextInputType.text,
          autofillHints: const [AutofillHints.username],
          textInputAction: TextInputAction.next,
          onSubmitted: (_) => displayNameFocus.requestFocus(),
        ),
        const SizedBox(height: 12),
        AuthTextField(
          controller: displayName,
          focusNode: displayNameFocus,
          label: 'Display name',
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.name],
          textInputAction: TextInputAction.done,
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

  @override
  void dispose() {
    username.dispose();
    displayName.dispose();
    usernameFocus.dispose();
    displayNameFocus.dispose();
    super.dispose();
  }
}

class AuthTextField extends StatelessWidget {
  const AuthTextField({
    required this.controller,
    required this.focusNode,
    required this.label,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.obscureText = false,
    this.textCapitalization = TextCapitalization.none,
    this.onSubmitted,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final String label;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final bool obscureText;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      autofillHints: autofillHints,
      obscureText: obscureText,
      autocorrect: false,
      enableSuggestions: !obscureText,
      textCapitalization: textCapitalization,
      onTap: focusNode.requestFocus,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(labelText: label),
    );
  }
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
