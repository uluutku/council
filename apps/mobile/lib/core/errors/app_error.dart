import 'package:supabase_flutter/supabase_flutter.dart';

enum AppErrorKind {
  validation,
  authenticationRequired,
  sessionExpired,
  permissionDenied,
  unavailable,
  notFound,
  conflict,
  rateLimited,
  connectivity,
  providerUnavailable,
  cancelled,
  unknown,
}

class AppError implements Exception {
  const AppError(this.kind, this.message, {this.code});

  final AppErrorKind kind;
  final String message;
  final String? code;

  static AppError from(Object error) {
    if (error is AppError) return error;
    if (error is AuthException) {
      return AppError(
        AppErrorKind.sessionExpired,
        'Your session has expired. Please sign in again.',
        code: error.statusCode,
      );
    }
    if (error is PostgrestException) {
      final code = error.code ?? error.message;
      final lower = code.toLowerCase();
      final kind = lower.contains('idempotency_conflict')
          ? AppErrorKind.conflict
          : lower.contains('not_found') || lower.contains('unavailable')
          ? AppErrorKind.notFound
          : lower.contains('rate')
          ? AppErrorKind.rateLimited
          : lower.contains('permission') || error.code == '42501'
          ? AppErrorKind.permissionDenied
          : AppErrorKind.unavailable;
      return AppError(kind, safeMessageFor(kind), code: code);
    }
    if (error is StorageException) {
      return AppError(
        AppErrorKind.unavailable,
        'The private file could not be accessed.',
        code: error.statusCode,
      );
    }
    return const AppError(
      AppErrorKind.unknown,
      'Something went wrong. Please try again.',
    );
  }

  static String safeMessageFor(AppErrorKind kind) => switch (kind) {
    AppErrorKind.validation => 'Check the highlighted fields and try again.',
    AppErrorKind.authenticationRequired => 'Please sign in to continue.',
    AppErrorKind.sessionExpired =>
      'Your session has expired. Please sign in again.',
    AppErrorKind.permissionDenied => 'This item is unavailable.',
    AppErrorKind.unavailable => 'This item is unavailable right now.',
    AppErrorKind.notFound => 'This item is unavailable.',
    AppErrorKind.conflict =>
      'This retry no longer matches the original request.',
    AppErrorKind.rateLimited => 'Please wait a moment before trying again.',
    AppErrorKind.connectivity => 'You appear to be offline.',
    AppErrorKind.providerUnavailable =>
      'The AI provider is unavailable right now.',
    AppErrorKind.cancelled => 'The request was cancelled.',
    AppErrorKind.unknown => 'Something went wrong. Please try again.',
  };
}
