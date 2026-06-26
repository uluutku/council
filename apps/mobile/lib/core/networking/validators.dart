typedef JsonMap = Map<String, dynamic>;

JsonMap asJsonMap(Object? value, String context) {
  if (value is Map) {
    return value.map((key, value) => MapEntry(key.toString(), value));
  }
  throw FormatException('Invalid $context response.');
}

List<JsonMap> asJsonMapList(Object? value, String context) {
  if (value == null) return const [];
  if (value is List) {
    return value.map((row) => asJsonMap(row, context)).toList();
  }
  throw FormatException('Invalid $context response.');
}

String requiredString(JsonMap json, String key) {
  final value = json[key];
  if (value is String && value.isNotEmpty) return value;
  throw FormatException('Missing $key.');
}

String? optionalString(JsonMap json, String key) {
  final value = json[key];
  if (value == null) return null;
  if (value is String) return value;
  throw FormatException('Invalid $key.');
}

int requiredInt(JsonMap json, String key) {
  final value = json[key];
  if (value is int) return value;
  if (value is num) return value.toInt();
  throw FormatException('Invalid $key.');
}

bool requiredBool(JsonMap json, String key) {
  final value = json[key];
  if (value is bool) return value;
  throw FormatException('Invalid $key.');
}
