import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class LocalNotifications {
  LocalNotifications._();
  static final instance = LocalNotifications._();

  final plugin = FlutterLocalNotificationsPlugin();
  final _seen = <String>{};

  Future<void> initialize() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
  }

  Future<void> showMessage({
    required String id,
    required String title,
    required String body,
  }) async {
    if (!_seen.add(id)) return;
    const android = AndroidNotificationDetails(
      'human_messages',
      'Human messages',
      channelDescription: 'Incoming Council human messages',
      importance: Importance.high,
      priority: Priority.high,
    );
    const ios = DarwinNotificationDetails();
    await plugin.show(
      id.hashCode & 0x7fffffff,
      title,
      body.length > 140 ? '${body.substring(0, 140)}...' : body,
      const NotificationDetails(android: android, iOS: ios),
    );
  }

  void clearDeduplication() => _seen.clear();
}
