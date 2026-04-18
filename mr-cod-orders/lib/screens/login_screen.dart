import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _errorMessage;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );
      // AuthGate in main.dart handles navigation on success.
    } on FirebaseAuthException catch (e) {
      setState(() {
        _errorMessage = switch (e.code) {
          'user-not-found' => 'No account found for this email.',
          'wrong-password' => 'Incorrect password.',
          'invalid-credential' => 'Invalid email or password.',
          'too-many-requests' => 'Too many attempts. Try again later.',
          _ => 'Sign in failed: ${e.message}',
        };
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: Stack(
        children: [
          // Background glow
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 500,
              height: 500,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.red.withOpacity(0.05),
              ),
            ),
          ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Brand
                      Row(
                        children: [
                          RichText(
                            text: const TextSpan(
                              children: [
                                TextSpan(
                                  text: 'MR',
                                  style: TextStyle(
                                    color: AppTheme.textPrimary,
                                    fontSize: 36,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -1,
                                  ),
                                ),
                                TextSpan(
                                  text: 'COD',
                                  style: TextStyle(
                                    color: AppTheme.red,
                                    fontSize: 36,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -1,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppTheme.red.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: AppTheme.red.withOpacity(0.3)),
                            ),
                            child: const Text(
                              'ORDERS',
                              style: TextStyle(
                                color: AppTheme.red,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 2,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Sign in to start managing orders',
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 48),

                      // Email field
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        style: const TextStyle(color: AppTheme.textPrimary),
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          prefixIcon: Icon(Icons.email_outlined,
                              color: AppTheme.textMuted),
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Please enter your email';
                          }
                          if (!v.contains('@')) return 'Invalid email address';
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      // Password field
                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        style: const TextStyle(color: AppTheme.textPrimary),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline,
                              color: AppTheme.textMuted),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                              color: AppTheme.textMuted,
                            ),
                            onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword),
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) {
                            return 'Please enter your password';
                          }
                          return null;
                        },
                        onFieldSubmitted: (_) => _signIn(),
                      ),

                      // Error message
                      if (_errorMessage != null) ...[
                        const SizedBox(height: 16),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppTheme.rejected.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                                color: AppTheme.rejected.withOpacity(0.3)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline,
                                  color: AppTheme.rejected, size: 18),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: const TextStyle(
                                    color: AppTheme.rejected,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      const SizedBox(height: 32),

                      // Sign in button
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _signIn,
                          child: _isLoading
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 2.5,
                                  ),
                                )
                              : const Text('Sign In'),
                        ),
                      ),

                      const SizedBox(height: 40),
                      Center(
                        child: Text(
                          'MR COD Belgium • Staff Only',
                          style: TextStyle(
                            color: AppTheme.textMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
