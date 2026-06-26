import 'package:flutter/material.dart';

class SharedChatBackground extends StatelessWidget {
  const SharedChatBackground({
    required this.background,
    required this.child,
    super.key,
  });

  final String background;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = switch ((background, dark)) {
      ('midnight', true) => const Color(0xFF030405),
      ('midnight', false) => const Color(0xFFF2F3F8),
      ('grid', true) => const Color(0xFF07090D),
      ('grid', false) => const Color(0xFFF9F8FF),
      ('paper', true) => const Color(0xFF080A0E),
      ('paper', false) => const Color(0xFFFBFAFF),
      _ => Theme.of(context).colorScheme.surface,
    };
    return DecoratedBox(
      decoration: BoxDecoration(color: base),
      child: CustomPaint(
        painter: _SharedChatBackgroundPainter(
          background: background,
          dark: dark,
        ),
        child: child,
      ),
    );
  }
}

class _SharedChatBackgroundPainter extends CustomPainter {
  const _SharedChatBackgroundPainter({
    required this.background,
    required this.dark,
  });

  final String background;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..strokeWidth = 1
      ..color = (dark ? Colors.white : const Color(0xFF3525CD)).withValues(
        alpha: dark ? 0.07 : 0.055,
      );
    if (background == 'grid' || background == 'midnight') {
      const step = 32.0;
      for (var x = 0.0; x < size.width; x += step) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
      }
      for (var y = 0.0; y < size.height; y += step) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      }
    }
    if (background == 'paper') {
      paint.color = (dark ? Colors.white : const Color(0xFF777587)).withValues(
        alpha: dark ? 0.045 : 0.08,
      );
      for (var y = 22.0; y < size.height; y += 28) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SharedChatBackgroundPainter oldDelegate) {
    return oldDelegate.background != background || oldDelegate.dark != dark;
  }
}
