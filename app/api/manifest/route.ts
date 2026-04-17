import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  let hostname = req.headers.get('host') || '';
  hostname = hostname.split(':')[0]; // Remove port for local testing

  // Default Customer Manifest
  let name = 'Mr. Cod Belgium';
  let short_name = 'Mr. Cod';
  let description = 'Mr. Cod Belgium - Order your favorite food online';
  let start_url = '/';
  let display = 'standalone';
  let orientation = 'portrait-primary';
  let theme_color = '#f59e0b'; // Amber
  let background_color = '#ffffff';

  if (hostname === 'manager.mrcod.be' || hostname === 'manager.localhost') {
    name = 'Mr. Cod Manager';
    short_name = 'Manager App';
    description = 'Store Manager Dashboard for Mr. Cod';
    theme_color = '#1e3a8a';
  } else if (hostname === 'admin.mrcod.be' || hostname === 'admin.localhost') {
    name = 'Mr. Cod Admin';
    short_name = 'Admin Dashboard';
    theme_color = '#000000';
  } else if (hostname === 'super.mrcod.be' || hostname === 'super.localhost') {
    name = 'Mr. Cod Super Admin';
    short_name = 'Super Admin';
    theme_color = '#000000';
  }

  const manifest = {
    name,
    short_name,
    description,
    start_url,
    display,
    background_color,
    theme_color,
    orientation,
    icons: [
      {
        src: '/icon?size=192x192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon?size=512x512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return NextResponse.json(manifest);
}
