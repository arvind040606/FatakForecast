export interface Landmark {
  id: string;
  name: string;
  punjabi: string;
  lat: number;
  lng: number;
  category: string;
}

export const AMRITSAR_LANDMARKS: Landmark[] = [
  { id: 'GOLDEN_TEMPLE', name: 'Sri Harmandir Sahib (Golden Temple)', punjabi: 'ਸ੍ਰੀ ਹਰਿਮੰਦਰ ਸਾਹਿਬ', lat: 31.6200, lng: 74.8765, category: 'Heritage' },
  { id: 'ASR_STATION', name: 'Amritsar Junction Railway Station (ASR)', punjabi: 'ਅੰਮ੍ਰਿਤਸਰ ਜੰਕਸ਼ਨ ਰੇਲਵੇ ਸਟੇਸ਼ਨ', lat: 31.6338, lng: 74.8655, category: 'Transit' },
  { id: 'RANJIT_AVENUE', name: 'Ranjit Avenue (District Shopping Complex)', punjabi: 'ਰਣਜੀਤ ਐਵੀਨਿਊ', lat: 31.6540, lng: 74.8580, category: 'Commercial' },
  { id: 'GNDU', name: 'Guru Nanak Dev University (GNDU)', punjabi: 'ਗੁਰੂ ਨਾਨਕ ਦੇਵ ਯੂਨੀਵਰਸਿਟੀ', lat: 31.6366, lng: 74.8258, category: 'Education' },
  { id: 'PUTLIGHAR', name: 'Putlighar Market (GT Road)', punjabi: 'ਪੁਤਲੀਘਰ ਮਾਰਕੀਟ', lat: 31.6300, lng: 74.8480, category: 'Market' },
  { id: 'CHAMRANG_ROAD', name: 'Chamrang Road (East Jaura Phatak)', punjabi: 'ਚਮਰੰਗ ਰੋਡ (ਜੋੜਾ ਫਾਟਕ ਪਾਰ)', lat: 31.6330, lng: 74.9050, category: 'Residential' },
  { id: 'VALLAH_MANDI', name: 'Vallah Sabzi Mandi (Mehta Road)', punjabi: 'ਵੱਲਾਹ ਸਬਜ਼ੀ ਮੰਡੀ', lat: 31.6360, lng: 74.9120, category: 'Trade' },
  { id: 'VERKA_CHOWK', name: 'Verka Bypass Chowk (Batala Road)', punjabi: 'ਵੇਰਕਾ ਚੌਕ', lat: 31.6620, lng: 74.9250, category: 'Corridor' },
  { id: 'AIRPORT', name: 'Sri Guru Ram Dass Jee Airport (ATQ)', punjabi: 'ਅੰਮ੍ਰਿਤਸਰ ਅੰਤਰਰਾਸ਼ਟਰੀ ਹਵਾਈ ਅੱਡਾ', lat: 31.7095, lng: 74.7973, category: 'Airport' },
  { id: 'CHHEHARTA', name: 'Chheharta Industrial Area', punjabi: 'ਛੇਹਰਟਾ ਇੰਡਸਟ੍ਰੀਅਲ ਏਰੀਆ', lat: 31.6280, lng: 74.8150, category: 'Industrial' }
];
