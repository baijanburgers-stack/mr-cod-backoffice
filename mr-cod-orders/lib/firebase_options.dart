import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        return web;
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDtpihAlLFvfwRQNhlCTwJM5aFZpYWD0NM',
    appId: '1:756041850780:android:1bcd32185af903332e7259',
    messagingSenderId: '756041850780',
    projectId: 'mr-cod-online-ordering',
    databaseURL:
        'https://mr-cod-online-ordering-default-rtdb.europe-west1.firebasedatabase.app',
    storageBucket: 'mr-cod-online-ordering.firebasestorage.app',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDIllocGZwxw4nmDF7DcHZC_3RyEc9nr2Y',
    appId: '1:756041850780:web:9c4271bb87cb64212e7259',
    messagingSenderId: '756041850780',
    projectId: 'mr-cod-online-ordering',
    authDomain: 'mr-cod-online-ordering.firebaseapp.com',
    storageBucket: 'mr-cod-online-ordering.firebasestorage.app',
    databaseURL:
        'https://mr-cod-online-ordering-default-rtdb.europe-west1.firebasedatabase.app',
  );
}
