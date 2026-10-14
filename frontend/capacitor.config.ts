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
      style: 'LIGHT',
      backgroundColor: '#0c1222'
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_train',
      iconColor: '#38bdf8'
    }
  }
};

export default config;
