import { ImageResponse } from 'next/og';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';
// Force dynamic rendering so we can await getDoc
export const dynamic = 'force-dynamic';

export default async function Icon() {
  let appLogo = '';
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'global'));
    if (docSnap.exists()) {
      appLogo = docSnap.data().appLogo || '';
    }
  } catch (err) {
    console.error('Failed to fetch logo for apple-icon:', err);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: appLogo ? 'white' : 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
          color: 'white',
          fontSize: 80,
          fontWeight: 900,
          fontFamily: 'sans-serif',
          letterSpacing: '-0.05em',
        }}
      >
        {appLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={appLogo} alt="Logo" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
        ) : (
          'MC'
        )}
      </div>
    ),
    { ...size }
  );
}
