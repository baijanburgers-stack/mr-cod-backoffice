import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Brand colours
  static const Color red = Color(0xFFE53935);
  static const Color redDark = Color(0xFFB71C1C);
  static const Color redLight = Color(0xFFEF9A9A);
  static const Color amber = Color(0xFFFFC107);

  // Backgrounds
  static const Color backgroundDark = Color(0xFF0A0A0A);
  static const Color surfaceDark = Color(0xFF141414);
  static const Color cardDark = Color(0xFF1C1C1C);
  static const Color divider = Color(0xFF2A2A2A);

  // Text
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFF9E9E9E);
  static const Color textMuted = Color(0xFF616161);

  // Status colours
  static const Color pending = Color(0xFFFF8F00);
  static const Color preparing = Color(0xFF1565C0);
  static const Color ready = Color(0xFF2E7D32);
  static const Color outForDelivery = Color(0xFF6A1B9A);
  static const Color completed = Color(0xFF424242);
  static const Color rejected = Color(0xFFC62828);

  static ThemeData get dark {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: backgroundDark,
      colorScheme: ColorScheme.dark(
        primary: red,
        onPrimary: textPrimary,
        surface: surfaceDark,
        onSurface: textPrimary,
        error: rejected,
      ),
      textTheme: TextTheme(
        displayLarge: const TextStyle(
          fontFamily: 'sans-serif',
          fontWeight: FontWeight.w900,
          color: textPrimary,
          letterSpacing: -1.5,
        ),
        headlineLarge: const TextStyle(
          fontWeight: FontWeight.w900,
          color: textPrimary,
          letterSpacing: -0.5,
        ),
        headlineMedium: const TextStyle(
          fontWeight: FontWeight.w800,
          color: textPrimary,
        ),
        titleLarge: const TextStyle(
          fontWeight: FontWeight.w700,
          color: textPrimary,
        ),
        bodyLarge: const TextStyle(
          fontWeight: FontWeight.w500,
          color: textPrimary,
        ),
        bodyMedium: const TextStyle(
          fontWeight: FontWeight.w400,
          color: textSecondary,
        ),
        labelLarge: const TextStyle(
          fontWeight: FontWeight.w700,
          color: textPrimary,
          letterSpacing: 0.5,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardDark,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: divider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: divider),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: red, width: 2),
        ),
        labelStyle: const TextStyle(color: textSecondary),
        hintStyle: const TextStyle(color: textMuted),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: red,
          foregroundColor: textPrimary,
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 16,
            letterSpacing: 0.5,
          ),
        ),
      ),
      cardTheme: CardTheme(
        color: cardDark,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: divider, width: 1),
        ),
      ),
      dividerColor: divider,
      appBarTheme: const AppBarTheme(
        backgroundColor: surfaceDark,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontWeight: FontWeight.w900,
          fontSize: 20,
          letterSpacing: -0.5,
        ),
      ),
    );
  }

  /// Returns a color for each order status.
  static Color statusColor(String status) {
    switch (status) {
      case 'Pending':
      case 'New':
        return pending;
      case 'Preparing':
        return preparing;
      case 'Ready':
        return ready;
      case 'Out for Delivery':
        return outForDelivery;
      case 'Completed':
        return completed;
      case 'Rejected':
      case 'Cancelled':
        return rejected;
      default:
        return textMuted;
    }
  }
}
