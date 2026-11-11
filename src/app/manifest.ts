import type { MetadataRoute } from 'next';

// installable: "add to home screen" gives her a full-screen app with the club's colours
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mesa',
    short_name: 'mesa',
    description: 'a closed girls club in barcelona.',
    start_url: '/plans',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0e0a0f',
    theme_color: '#0e0a0f',
    lang: 'en',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
