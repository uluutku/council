import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

final localStoreProvider = Provider<LocalStore>((ref) => LocalStore());

class LocalStore {
  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  String _key(String userId, String area, String id) =>
      'council.$userId.$area.$id';

  Future<String?> readDraft(String userId, String area, String id) async {
    return (await _prefs).getString(_key(userId, '$area.draft', id));
  }

  Future<void> writeDraft(
    String userId,
    String area,
    String id,
    String value,
  ) async {
    final bounded = value.length > 8000 ? value.substring(0, 8000) : value;
    await (await _prefs).setString(_key(userId, '$area.draft', id), bounded);
  }

  Future<void> removeDraft(String userId, String area, String id) async {
    await (await _prefs).remove(_key(userId, '$area.draft', id));
  }

  Future<List<Map<String, dynamic>>> readQueue(String userId) async {
    final raw = (await _prefs).getString(
      _key(userId, 'messaging.queue', 'items'),
    );
    if (raw == null) return const [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((row) => row.cast<String, dynamic>())
        .toList();
  }

  Future<void> writeQueue(
    String userId,
    List<Map<String, dynamic>> items,
  ) async {
    final bounded = items.take(50).toList(growable: false);
    await (await _prefs).setString(
      _key(userId, 'messaging.queue', 'items'),
      jsonEncode(bounded),
    );
  }

  Future<void> clearUser(String userId) async {
    final prefs = await _prefs;
    final prefix = 'council.$userId.';
    for (final key
        in prefs.getKeys().where((key) => key.startsWith(prefix)).toList()) {
      await prefs.remove(key);
    }
  }
}
