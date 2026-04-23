import { ImageResponse } from 'next/og';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const runtime = 'nodejs';

export async function GET() {
  let appLogo = '';
  
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'global'));
    if (docSnap.exists()) {
      appLogo = docSnap.data().appLogo || '';
    }
  } catch (error) {
    console.error('Failed to load logo for Icon:', error);
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
    {
      width: 180,
      height: 180,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Content-Type': 'image/png',
      },
    }
  );
}
