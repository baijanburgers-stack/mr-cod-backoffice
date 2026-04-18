import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'screens/login_screen.dart';
import 'screens/orders_screen.dart';
import 'theme/app_theme.dart';
import 'package:firebase_auth/firebase_auth.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const MrCodOrdersApp());
}

class MrCodOrdersApp extends StatelessWidget {
  const MrCodOrdersApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MR COD Orders',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      home: const AuthGate(),
    );
  }
}

/// Listens to Firebase auth state and routes to Login or Orders screen.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            backgroundColor: AppTheme.backgroundDark,
            body: Center(
              child: CircularProgressIndicator(color: AppTheme.red),
            ),
          );
        }
        if (snapshot.hasData && snapshot.data != null) {
          return const OrdersScreen();
        }
        return const LoginScreen();
      },
    );
  }
}
