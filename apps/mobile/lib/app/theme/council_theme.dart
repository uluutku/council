import 'package:flutter/material.dart';

class CouncilTheme {
  static const indigo = Color(0xFF3525CD);
  static const aiViolet = Color(0xFF5C00CA);

  static ThemeData light() => _base(
    brightness: Brightness.light,
    background: const Color(0xFFFBF8FF),
    surface: Colors.white,
    text: const Color(0xFF191B25),
  );

  static ThemeData dark() => _base(
    brightness: Brightness.dark,
    background: const Color(0xFF101014),
    surface: const Color(0xFF191A22),
    text: const Color(0xFFF4F1FB),
  );

  static ThemeData _base({
    required Brightness brightness,
    required Color background,
    required Color surface,
    required Color text,
  }) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: indigo,
      brightness: brightness,
      primary: indigo,
      secondary: aiViolet,
      surface: surface,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: background,
      fontFamily: 'Roboto',
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
          side: BorderSide(color: colorScheme.outlineVariant),
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
