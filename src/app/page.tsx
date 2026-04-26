"use client";

import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--background)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div className="marker-pulse" style={{ width: '48px', height: '48px', backgroundColor: 'var(--brand-red)', borderRadius: '50%' }}></div>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>지도 데이터를 불러오는 중...</p>
      </div>
    </div>
  )
});

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MapComponent />
    </main>
  );
}
