import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mrcodbelgium.app',
  appName: 'mr-cod-belgium',
  webDir: 'public',
  // Configure this to your local dev IP (e.g. http://192.168.1.x:3000) for local device testing
  // OR your live production URL (e.g. https://your-site.com) for App Store submission
  // This ensures the native app acts as a shell wrapping your live Next.js Next.js server actions & DB
  server: {
    url: 'http://10.0.2.2:3000', // Default Android emulator local loopback
    cleartext: true 
  }
};

export default config;
