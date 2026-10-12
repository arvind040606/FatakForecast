import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.fatakforecast.app',
  appName: 'FatakForecast',
  webDir: 'dist',
  backgroundColor: '#070b14',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#070b14'
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_train',
      iconColor: '#38bdf8',
      sound: 'beep.wav'
    }
  }
};

export default config;
