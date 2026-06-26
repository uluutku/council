import 'package:flutter/material.dart';

@immutable
class CouncilColors extends ThemeExtension<CouncilColors> {
  const CouncilColors({
    required this.surfaceMuted,
    required this.surfaceHover,
    required this.textSecondary,
    required this.textTertiary,
    required this.border,
    required this.divider,
    required this.accentHover,
    required this.accentSoft,
    required this.aiAccent,
    required this.aiAccentSoft,
    required this.messageIncoming,
    required this.messageIncomingBorder,
    required this.messageOutgoing,
    required this.messageOutgoingText,
    required this.danger,
    required this.dangerSoft,
    required this.info,
    required this.infoSoft,
  });

  final Color surfaceMuted;
  final Color surfaceHover;
  final Color textSecondary;
  final Color textTertiary;
  final Color border;
  final Color divider;
  final Color accentHover;
  final Color accentSoft;
  final Color aiAccent;
  final Color aiAccentSoft;
  final Color messageIncoming;
  final Color messageIncomingBorder;
  final Color messageOutgoing;
  final Color messageOutgoingText;
  final Color danger;
  final Color dangerSoft;
  final Color info;
  final Color infoSoft;

  @override
  CouncilColors copyWith({
    Color? surfaceMuted,
    Color? surfaceHover,
    Color? textSecondary,
    Color? textTertiary,
    Color? border,
    Color? divider,
    Color? accentHover,
    Color? accentSoft,
    Color? aiAccent,
    Color? aiAccentSoft,
    Color? messageIncoming,
    Color? messageIncomingBorder,
    Color? messageOutgoing,
    Color? messageOutgoingText,
    Color? danger,
    Color? dangerSoft,
    Color? info,
    Color? infoSoft,
  }) {
    return CouncilColors(
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      surfaceHover: surfaceHover ?? this.surfaceHover,
      textSecondary: textSecondary ?? this.textSecondary,
      textTertiary: textTertiary ?? this.textTertiary,
      border: border ?? this.border,
      divider: divider ?? this.divider,
      accentHover: accentHover ?? this.accentHover,
      accentSoft: accentSoft ?? this.accentSoft,
      aiAccent: aiAccent ?? this.aiAccent,
      aiAccentSoft: aiAccentSoft ?? this.aiAccentSoft,
      messageIncoming: messageIncoming ?? this.messageIncoming,
      messageIncomingBorder:
          messageIncomingBorder ?? this.messageIncomingBorder,
      messageOutgoing: messageOutgoing ?? this.messageOutgoing,
      messageOutgoingText: messageOutgoingText ?? this.messageOutgoingText,
      danger: danger ?? this.danger,
      dangerSoft: dangerSoft ?? this.dangerSoft,
      info: info ?? this.info,
      infoSoft: infoSoft ?? this.infoSoft,
    );
  }

  @override
  CouncilColors lerp(ThemeExtension<CouncilColors>? other, double t) {
    if (other is! CouncilColors) return this;
    Color blend(Color a, Color b) => Color.lerp(a, b, t)!;
    return CouncilColors(
      surfaceMuted: blend(surfaceMuted, other.surfaceMuted),
      surfaceHover: blend(surfaceHover, other.surfaceHover),
      textSecondary: blend(textSecondary, other.textSecondary),
      textTertiary: blend(textTertiary, other.textTertiary),
      border: blend(border, other.border),
      divider: blend(divider, other.divider),
      accentHover: blend(accentHover, other.accentHover),
      accentSoft: blend(accentSoft, other.accentSoft),
      aiAccent: blend(aiAccent, other.aiAccent),
      aiAccentSoft: blend(aiAccentSoft, other.aiAccentSoft),
      messageIncoming: blend(messageIncoming, other.messageIncoming),
      messageIncomingBorder: blend(
        messageIncomingBorder,
        other.messageIncomingBorder,
      ),
      messageOutgoing: blend(messageOutgoing, other.messageOutgoing),
      messageOutgoingText: blend(
        messageOutgoingText,
        other.messageOutgoingText,
      ),
      danger: blend(danger, other.danger),
      dangerSoft: blend(dangerSoft, other.dangerSoft),
      info: blend(info, other.info),
      infoSoft: blend(infoSoft, other.infoSoft),
    );
  }
}

extension CouncilThemeColors on BuildContext {
  CouncilColors get councilColors => Theme.of(this).extension<CouncilColors>()!;
}

class CouncilTheme {
  static const indigo = Color(0xFF3525CD);
  static const aiViolet = Color(0xFF5C00CA);
  static const _lightTokens = CouncilColors(
    surfaceMuted: Color(0xFFF3F2FF),
    surfaceHover: Color(0xFFEDEDFB),
    textSecondary: Color(0xFF464555),
    textTertiary: Color(0xFF777587),
    border: Color(0xFFC7C4D8),
    divider: Color(0xFFD9D9E7),
    accentHover: Color(0xFF4D44E3),
    accentSoft: Color(0xFFE2DFFF),
    aiAccent: aiViolet,
    aiAccentSoft: Color(0xFFF5F3FF),
    messageIncoming: Color(0xFFF2F4F7),
    messageIncomingBorder: Color(0xFFE4E7EC),
    messageOutgoing: indigo,
    messageOutgoingText: Colors.white,
    danger: Color(0xFFBA1A1A),
    dangerSoft: Color(0xFFFFDAD6),
    info: Color(0xFF0051D5),
    infoSoft: Color(0xFFDBE1FF),
  );
  static const _darkTokens = CouncilColors(
    surfaceMuted: Color(0xFF222330),
    surfaceHover: Color(0xFF292A38),
    textSecondary: Color(0xFFD9D6E7),
    textTertiary: Color(0xFFA9A6B8),
    border: Color(0xFF49465C),
    divider: Color(0xFF302E3B),
    accentHover: Color(0xFF918BFF),
    accentSoft: Color(0xFF2B2852),
    aiAccent: Color(0xFFD2BBFF),
    aiAccentSoft: Color(0xFF241B34),
    messageIncoming: Color(0xFF23252D),
    messageIncomingBorder: Color(0xFF383B46),
    messageOutgoing: indigo,
    messageOutgoingText: Colors.white,
    danger: Color(0xFFFFB4AB),
    dangerSoft: Color(0xFF4A1517),
    info: Color(0xFFB8C4FF),
    infoSoft: Color(0xFF182445),
  );

  static ThemeMode modeFromSetting(String? theme) => switch (theme) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };

  static ThemeData light() => _base(
    brightness: Brightness.light,
    background: const Color(0xFFFBF8FF),
    surface: Colors.white,
    text: const Color(0xFF191B25),
    tokens: _lightTokens,
  );

  static ThemeData dark() => _base(
    brightness: Brightness.dark,
    background: const Color(0xFF101014),
    surface: const Color(0xFF191A22),
    text: const Color(0xFFF4F1FB),
    tokens: _darkTokens,
  );

  static ThemeData _base({
    required Brightness brightness,
    required Color background,
    required Color surface,
    required Color text,
    required CouncilColors tokens,
  }) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: indigo,
      brightness: brightness,
      primary: indigo,
      secondary: aiViolet,
      surface: surface,
      error: tokens.danger,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: background,
      fontFamily: 'Roboto',
      extensions: [tokens],
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: background,
        foregroundColor: text,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: tokens.border.withValues(alpha: 0.55)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        filled: true,
        fillColor: surface,
      ),
      navigationBarTheme: NavigationBarThemeData(
        indicatorColor: indigo.withValues(alpha: 0.14),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}
