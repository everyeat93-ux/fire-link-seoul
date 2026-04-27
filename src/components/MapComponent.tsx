// @ts-nocheck
"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMapEvents, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { Camera, AlertCircle, Image as ImageIcon, MapPinned, Info, X, Loader2, LocateFixed, Menu, History, Search, Edit2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/lib/supabase';

interface BuildingRecord {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  floors: string;
  has_photos: boolean;
  visited_at: string;
  registered_at?: string;
  // Wiki edit fields
  user_edited_name?: string;
  user_edited_address?: string;
  edited_by?: string;
  edited_at?: string;
  photo1_x?: number;
  photo1_y?: number;
  photo2_x?: number;
  photo2_y?: number;
  field_note?: string;
  // Actual file paths in storage
  photo1_path?: string;
  photo2_path?: string;
}

interface SelectedLocation extends BuildingRecord {
  geojson: any; // Leaflet GeoJSON data
  originalName: string;
  originalAddress: string;
}

// ── Image with Circle Overlay Component ──
function ImageWithCircle({ src, circle, onCircleSet, isEditing, label, allowCircle = true }: { src: string, circle: { x: number, y: number } | null, onCircleSet: (pos: { x: number, y: number }) => void, isEditing: boolean, label: string, allowCircle?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (circle && allowCircle) {
        ctx.beginPath();
        ctx.arc(circle.x * canvas.width, circle.y * canvas.height, 48, 0, 2 * Math.PI); // Radius 12 -> 48 (4x)
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 6;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(circle.x * canvas.width, circle.y * canvas.height, 48, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fill();

        // Pulsing outer ring
        ctx.beginPath();
        ctx.arc(circle.x * canvas.width, circle.y * canvas.height, 64, 0, 2 * Math.PI); // Radius 18 -> 64
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    };

    render();
  }, [circle, allowCircle]);

  const handleInteraction = (e: any) => {
    if (!isEditing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    onCircleSet({ x, y });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--brand-red)' }}></div>
        {label}
      </span>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--surface)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <img 
          src={src} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          alt={label}
        />
        {allowCircle && (
          <canvas
            ref={canvasRef}
            width={400}
            height={300}
            onClick={(e) => isEditing && handleInteraction(e)}
            onTouchStart={(e) => isEditing && handleInteraction(e)}
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              cursor: isEditing ? 'crosshair' : 'default',
              touchAction: isEditing ? 'none' : 'auto', // Allow scroll when not editing
              pointerEvents: isEditing ? 'auto' : 'none', // Critical: pass touches to parent for scrolling
              zIndex: 10
            }}
          />
        )}
        {(isEditing && allowCircle) && (
          <div style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: 'rgba(255,42,42,0.9)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, pointerEvents: 'none', zIndex: 20 }}>
            위치 지정 모드
          </div>
        )}
      </div>
    </div>
  );
}


// Component to handle map clicks
function MapEvents({ onMapClick }: { onMapClick: (e: L.LeafletMouseEvent) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e);
    },
  });
  return null;
}

// Locate Me Control
function LocateControl() {
  const map = useMap();
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    map.on('locationfound', (e) => {
      setLocating(false);
      map.flyTo(e.latlng, 18, { duration: 1.5 });
    });
    map.on('locationerror', (e) => {
      setLocating(false);
      console.error('Location error details:', e.message);
      alert('위치 정보를 가져올 수 없습니다. GPS 설정과 브라우저 권한을 확인해주세요.');
    });
  }, [map]);

  return (
    <button
      className="glass btn-hover-effect"
      onClick={() => {
        try {
          setLocating(true);
          map.locate({ 
            setView: true, 
            maxZoom: 18, 
            enableHighAccuracy: true,
            timeout: 10000 
          });
        } catch (error) {
          console.error('Locate error:', error);
          setLocating(false);
          alert('위치 정보를 가져올 수 없습니다.');
        }
      }}
      style={{
        position: 'absolute',
        bottom: '180px', // Positioned higher to avoid mobile browser bottom bar
        right: '10px',
        zIndex: 1000,
        width: '34px',
        height: '34px',
        borderRadius: '8px', // Match leaflet zoom control style
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        padding: 0,
        backgroundColor: 'var(--surface)'
      }}
    >
      <LocateFixed size={18} color={locating ? "var(--brand-red)" : "var(--text-primary)"} className={locating ? "animate-pulse" : ""} />
    </button>
  );
}

export default function MapComponent() {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Menu panel states
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showStation, setShowStation] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState(0);
  const [offlineDownloading, setOfflineDownloading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Building registry (real data from Supabase)
  const [registry, setRegistry] = useState<BuildingRecord[]>([]);

  // Device UUID - "나" 구분자 (기기당 고유 ID, 로그인 없는 MVP)
  const [deviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('fire-link-device-id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('fire-link-device-id', id);
    return id;
  });

  const fetchRegistry = async () => {
    try {
      const { data, error } = await supabase.from('buildings').select('*');
      if (!error && data) {
        setRegistry(data as BuildingRecord[]);
      }
    } catch (error) {
      console.error('Fetch registry error:', error);
    }
  };

  useEffect(() => { fetchRegistry(); }, []);

  // Upload photo states
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [fieldNote, setFieldNote] = useState('');

  // Wiki edit mode state
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Circle coordinates state
  const [p1Circle, setP1Circle] = useState<{ x: number, y: number } | null>(null);
  const [p2Circle, setP2Circle] = useState<{ x: number, y: number } | null>(null);
  const [isEditingCircles, setIsEditingCircles] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Default center: Seoul City Hall
  const position: [number, number] = [37.5665, 126.9780];

  const handleMapClick = async (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng;
    setIsLoading(true);
    setSelectedLocation(null);

    try {
      // Fetch data from V-World Data API via Next.js API route
      const response = await fetch(`/api/vworld?lat=${lat}&lng=${lng}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data?.response?.status === 'OK' && data.response.result?.featureCollection?.features?.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        const bldId = feature.id;
        const bldName = feature.properties.bld_nm || '이름 없는 건물';
        const bldAddr = feature.properties.jibun_adres || feature.properties.road_adres || '주소 정보 없음';
        const bldFloors = feature.properties.grnd_flr || '?';

        // Supabase에서 해당 건물 정보 조회
        const { data: existingData, error: fetchError } = await supabase
          .from('buildings')
          .select('*')
          .eq('id', bldId)
          .maybeSingle(); // .single() 대신 .maybeSingle() 사용 (0개일 때 에러 방지)

        const alreadyHasPhotos = existingData?.has_photos ?? false;

        // 중요: DB에 수정한 이름이 있으면 그것을 쓰고, 없으면 V-World 이름을 사용
        const currentName = existingData?.user_edited_name || existingData?.name || bldName;
        const currentAddress = existingData?.user_edited_address || existingData?.address || bldAddr;
        const currentFloors = existingData?.floors || bldFloors || '?';

        try {
          // 방문 기록 저장 (기존 데이터가 아예 없을 때만 새로 추가)
          if (!existingData && !fetchError) {
            const newRecord = {
              id: bldId,
              name: bldName,
              address: bldAddr,
              lat, lng, floors: bldFloors,
              has_photos: false,
              visited_at: new Date().toISOString(),
              device_id: deviceId
            };
            await supabase.from('buildings').insert(newRecord);
            fetchRegistry();
          }
        } catch (dbErr) {
          console.error('Database record error:', dbErr);
        }

        // Construct storage URLs using actual saved file paths (handles any extension)
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
        const buildPhotoUrl = (path: string | undefined | null) => {
          if (!path) return null;
          return `${baseUrl}/storage/v1/object/public/building-photos/${path}?t=${Date.now()}`;
        };
        const photo1_url = alreadyHasPhotos ? buildPhotoUrl(existingData?.photo1_path) : null;
        const photo2_url = alreadyHasPhotos ? buildPhotoUrl(existingData?.photo2_path) : null;

        setSelectedLocation({
          id: bldId, 
          lat: lat || 0, 
          lng: lng || 0,
          name: currentName || '이름 없는 건물',
          address: currentAddress || '주소 정보 없음',
          floors: String(currentFloors),
          geojson: feature?.geometry || null,
          has_photos: !!alreadyHasPhotos,
          photo1_url,
          photo2_url,
          field_note: existingData?.field_note || '',
          photo1_x: existingData?.photo1_x,
          photo1_y: existingData?.photo1_y,
          photo2_x: existingData?.photo2_x,
          photo2_y: existingData?.photo2_y,
          photo1_path: existingData?.photo1_path,
          photo2_path: existingData?.photo2_path,
          // 원본 정보 백업
          originalName: existingData?.name || bldName || '이름 없는 건물',
          originalAddress: existingData?.address || bldAddr || '주소 정보 없음'
        });

        // Set circles if they exist
        if (existingData?.photo1_x !== undefined && existingData?.photo1_y !== undefined) {
          setP1Circle({ x: existingData.photo1_x, y: existingData.photo1_y });
        } else {
          setP1Circle(null);
        }
        if (existingData?.photo2_x !== undefined && existingData?.photo2_y !== undefined) {
          setP2Circle({ x: existingData.photo2_x, y: existingData.photo2_y });
        } else {
          setP2Circle(null);
        }
      } else {
        // V-World 데이터가 없는 경우: 주변 10m 이내에 이미 등록된 수동 건물이 있는지 확인
        const threshold = 0.00015; // 약 15m 오차 허용 범위
        const existingManual = registry.find(r =>
          r.id.startsWith('manual-') &&
          Math.abs(r.lat - lat) < threshold &&
          Math.abs(r.lng - lng) < threshold
        );

        if (existingManual) {
          setSelectedLocation({
            ...existingManual,
            name: existingManual.user_edited_name || existingManual.name,
            address: existingManual.user_edited_address || existingManual.address,
            geojson: null,
            originalName: '건물 정보 없음',
            originalAddress: 'V-World 데이터 없음'
          });
        } else {
          // 새로 등록할 경우의 ID 생성
          const manualId = `manual-${lat.toFixed(6)}-${lng.toFixed(6)}`;
          setSelectedLocation({
            id: manualId, lat, lng,
            name: '건물 정보 없음',
            address: '선택한 위치에 V-World 건물 데이터가 없습니다.',
            geojson: null,
            has_photos: false,
            originalName: '건물 정보 없음',
            originalAddress: 'V-World 데이터 없음'
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch location data:", error);
      alert('데이터를 불러오는데 실패했습니다. (.env.local 파일에 VWORLD_API_KEY를 설정했는지 확인해주세요)');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (data?.response?.status === 'OK' && data.response.result?.items) {
        setSearchResults(data.response.result.items);
      } else {
        setSearchResults([]);
        alert('검색 결과가 없습니다.');
      }
    } catch (error) {
      console.error("Search failed:", error);
      alert('검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  // Fix for 'Mark' broken image: render a custom circle instead of default marker for Point GeoJSON
  const pointToLayer = (feature: any, latlng: L.LatLng) => {
    return L.circleMarker(latlng, {
      radius: 8,
      fillColor: "var(--brand-red)",
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
      className: 'marker-pulse'
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={position}
        zoom={16}
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="dark-tiles"
        />

        <ZoomControl position="bottomright" />
        <LocateControl />

        <MapEvents onMapClick={handleMapClick} />

        {/* Highlight the selected building polygon or point */}
        {selectedLocation?.geojson && (
          <GeoJSON
            key={selectedLocation.id}
            data={selectedLocation.geojson}
            pointToLayer={pointToLayer}
            style={{
              color: 'var(--brand-red)',
              weight: 3,
              fillColor: 'var(--brand-red)',
              fillOpacity: 0.4,
              className: 'marker-pulse'
            }}
          />
        )}
      </MapContainer>

      {/* Top Bar - Branded Glassmorphism */}
      <div
        className="glass"
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          padding: '8px 20px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '94%',
          maxWidth: '500px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--brand-red)', borderRadius: '12px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(255,42,42,0.3)' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-0.5px', color: 'white' }}>파이어링크 <span style={{ color: 'var(--brand-red)', fontSize: '11px', verticalAlign: 'top', fontWeight: 500 }}>SEOUL</span></h1>
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>건물 연결송수관 설비 정보 시스템</p>
        </div>
        <button
          onClick={() => setShowMenu(true)}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Search Bar */}
      <div style={{
        position: 'absolute',
        top: '90px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        width: '90%',
        maxWidth: '500px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <form
          onSubmit={handleSearch}
          className="glass"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 16px',
            borderRadius: '100px',
            border: '1px solid var(--border)'
          }}
        >
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="주소나 건물명으로 검색 (예: 세종대로 110)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              padding: '12px 12px',
              outline: 'none',
              fontSize: '14px'
            }}
          />
          {isSearching && <Loader2 size={16} className="animate-spin" color="var(--brand-red)" style={{ animation: 'spin 1s linear infinite' }} />}
        </form>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden', maxHeight: '250px', overflowY: 'auto' }}>
            {searchResults.map((result, idx) => (
              <div
                key={idx}
                onClick={async () => {
                  const lat = parseFloat(result.point.y);
                  const lng = parseFloat(result.point.x);
                  setSearchResults([]);
                  setSearchQuery('');
                  // Fly to location and fetch V-World polygon
                  await handleMapClick({ latlng: { lat, lng } } as any);
                }}
                style={{
                  padding: '12px 16px',
                  borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                className="btn-hover-effect"
              >
                <span style={{ fontSize: '14px', fontWeight: 600 }}>
                  {result.address?.road || result.address?.parcel || '주소 정보'}
                </span>
                {result.address?.parcel && result.address?.road && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    지번: {result.address.parcel}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Branded Loading Overlay */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(10, 11, 14, 0.9)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{ position: 'relative', width: '100px', height: '100px', marginBottom: '24px' }}>
            <div style={{ 
              position: 'absolute', 
              inset: '-10px', 
              background: 'var(--brand-red)', 
              borderRadius: '50%', 
              opacity: 0.2, 
              animation: 'logo-pulse 2s infinite' 
            }}></div>
            <img 
              src="/logo.png" 
              alt="Loading..." 
              style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }} 
            />
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.5px' }}>데이터 분석 중...</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>파이어링크 : 대원의 안전이 최우선입니다</span>
          <style>{`
            @keyframes logo-pulse {
              0% { transform: scale(1); opacity: 0.2; }
              50% { transform: scale(1.4); opacity: 0; }
              100% { transform: scale(1); opacity: 0.2; }
            }
          `}</style>
        </div>
      )}

      {/* Side Menu Drawer */}
      {showMenu && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <div style={{ flex: 1 }} onClick={() => setShowMenu(false)}></div>
          <div className="glass-panel" style={{ width: '280px', height: '100%', borderTop: 'none', borderLeft: '1px solid var(--border)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>메뉴</h2>
              <button onClick={() => setShowMenu(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowUnregistered(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '12px', border: 'none', padding: '14px 12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,42,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertCircle size={18} color="var(--brand-red)" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>미등록 건물 현황</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>송수관 사진 미등록 건물 목록</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowStats(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '12px', border: 'none', padding: '14px 12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,42,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <History size={18} color="var(--brand-red)" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>내 기여 현황</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>등록 완료 건물 · 사진 통계</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowOffline(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '12px', border: 'none', padding: '14px 12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,42,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPinned size={18} color="var(--brand-red)" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>오프라인 지도 다운로드</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>현장 인터넷 불가 시 대비</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowGuide(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '12px', border: 'none', padding: '14px 12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,42,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Camera size={18} color="var(--brand-red)" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>송수관 촬영 가이드</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>올바른 촬영 기준 및 각도 안내</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowStation(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '12px', border: 'none', padding: '14px 12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,42,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Info size={18} color="var(--brand-red)" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>관할 소방서 정보</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>소속 소방서 연락처 · 관할 구역</div>
                </div>
              </button>
            </div>

            <div style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
              Fire-Link: Seoul v1.0.0
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet - Details View */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: selectedLocation ? '0' : '-100%',
          left: '0',
          width: '100%',
          zIndex: 1000,
          transition: 'bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          padding: '24px',
          paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 40px))', // Drastically increased padding
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          maxHeight: '85vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)'
        }}
      >
        {selectedLocation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Building header with wiki edit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, marginRight: '8px' }}>
                {isEditing ? (
                  /* ── 편집 모드 ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>건물명</label>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="건물 이름을 입력하세요"
                        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--brand-red)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '16px', fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>주소 / 위치 보완</label>
                      <input
                        value={editAddress}
                        onChange={e => setEditAddress(e.target.value)}
                        placeholder="주소나 위치 설명을 보완하세요"
                        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-primary"
                        style={{ flex: 1, padding: '10px' }}
                        onClick={async () => {
                          try {
                            if (!selectedLocation || !selectedLocation.id) {
                              alert('건물 정보가 올바르지 않습니다.');
                              return;
                            }
                            const updatedName = editName.trim();
                            const updatedAddr = editAddress.trim();

                            const editData = {
                              id: selectedLocation.id,
                              name: selectedLocation.originalName || selectedLocation.name || '',
                              address: selectedLocation.originalAddress || selectedLocation.address || '',
                              lat: selectedLocation.lat,
                              lng: selectedLocation.lng,
                              floors: String(selectedLocation.floors || '?'),
                              user_edited_name: updatedName || null,
                              user_edited_address: updatedAddr || null,
                              edited_by: deviceId.slice(0, 8),
                              edited_at: new Date().toISOString()
                            };

                            const { error } = await supabase.from('buildings').upsert(editData);

                            if (error) throw error;

                            // 로컬 상태 즉시 업데이트
                            setSelectedLocation((prev: any) => ({
                              ...prev,
                              name: updatedName || prev.originalName || prev.name,
                              address: updatedAddr || prev.originalAddress || prev.address,
                              user_edited_name: updatedName || null,
                              user_edited_address: updatedAddr || null
                            }));

                            setIsEditing(false);
                            await fetchRegistry(); // 전체 목록 새로고침
                          } catch (err: any) {
                            console.error('Save error:', err);
                            alert('저장 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
                          }
                        }}
                      >저장</button>
                      <button
                        onClick={() => setIsEditing(false)}
                        style={{ flex: 1, padding: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
                      >취소</button>
                    </div>
                  </div>
                ) : (
                  /* ── 보기 모드 ── */
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <MapPinned size={18} color="var(--brand-red)" />
                      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{selectedLocation.name}</h2>
                      {/* 편집 버튼 */}
                      <button
                        title="건물 정보 수정"
                        onClick={() => { setEditName(selectedLocation.name === '이름 없는 건물' ? '' : selectedLocation.name); setEditAddress(selectedLocation.address === '주소 정보 없음' ? '' : selectedLocation.address); setIsEditing(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', opacity: 0.6, display: 'flex', alignItems: 'center' }}
                      >
                        ✏️
                      </button>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', wordBreak: 'keep-all' }}>{selectedLocation.address}</p>
                    {/* 편집 이력 뱃지 */}
                    {registry.find(r => r.id === selectedLocation.id)?.user_edited_name && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', backgroundColor: 'rgba(30,120,255,0.15)', border: '1px solid rgba(30,120,255,0.3)', borderRadius: '100px', padding: '2px 8px' }}>
                        <span style={{ fontSize: '10px', color: '#6ea8fe' }}>🔵 대원 편집됨 · {new Date(registry.find(r => r.id === selectedLocation.id)!.edited_at!).toLocaleDateString('ko-KR')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setSelectedLocation(null); setIsEditing(false); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
              >
                <X size={24} />
              </button>
            </div>

            {selectedLocation.has_photos ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* ── '위치 수정' 버튼 (기능 트리거) ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {isEditingCircles ? '사진을 터치하여 송수구 위치를 지정하세요' : '연결송수관 위치가 표시된 사진입니다'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!isEditingCircles && (
                      <button 
                        className="btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '100px', backgroundColor: 'rgba(255,255,255,0.05)' }}
                        onClick={() => setShowUploadModal(true)}
                      >
                        사진 재등록
                      </button>
                    )}
                    <button 
                      className={isEditingCircles ? "btn-primary" : "btn-secondary"}
                      style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '100px' }}
                      onClick={async () => {
                        if (isEditingCircles) {
                          // 저장 로직
                          try {
                            if (!selectedLocation) return;
                            const { error } = await supabase
                              .from('buildings')
                              .update({
                                photo1_x: p1Circle?.x,
                                photo1_y: p1Circle?.y,
                                photo2_x: p2Circle?.x,
                                photo2_y: p2Circle?.y
                              })
                              .eq('id', selectedLocation.id);
                            
                            if (error) throw error;
                            setIsEditingCircles(false);
                            fetchRegistry();
                          } catch (error) {
                            console.error(error);
                            alert('위치 정보 저장 실패');
                          }
                        } else {
                          setIsEditingCircles(true);
                        }
                      }}
                    >
                      {isEditingCircles ? '위치 저장 완료' : '위치 수정'}
                    </button>
                  </div>
                </div>

                {/* ── 사진 수직 배치 ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <ImageWithCircle 
                    label="건물 전체 전경 (송수구 위치 표시)"
                    src={selectedLocation.photo1_url || "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80"}
                    circle={p1Circle}
                    onCircleSet={(pos) => setP1Circle(pos)}
                    isEditing={isEditingCircles}
                    allowCircle={true}
                  />
                  <ImageWithCircle 
                    label="설비 근접 사진 (상세 위치)"
                    src={selectedLocation.photo2_url || "https://images.unsplash.com/photo-1621245059942-0fbc35851de9?w=800&auto=format&fit=crop&q=80"}
                    circle={p2Circle}
                    onCircleSet={(pos) => setP2Circle(pos)}
                    isEditing={isEditingCircles}
                    allowCircle={false}
                  />
                </div>

                <div style={{ backgroundColor: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'rgba(255,170,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Info size={14} color="var(--warning)" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>현장 특이사항</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {selectedLocation.field_note || '등록된 메모가 없습니다.'}
                  </p>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                backgroundColor: 'var(--surface)',
                borderRadius: '16px',
                border: '1px dashed var(--border)',
                gap: '16px'
              }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '32px', backgroundColor: 'rgba(255, 42, 42, 0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <ImageIcon size={32} color="var(--brand-red)" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>등록된 사진이 없습니다</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>이 건물에 대한 송수관 전경/상세 사진을 등록해주세요.</p>
                </div>
                <button className="btn-primary" onClick={() => setShowUploadModal(true)} style={{ width: '100%', marginTop: '8px' }}>
                  <Camera size={20} />
                  <span>사진 촬영 및 업로드</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal Overlay */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(4px)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end'
        }}>
          <div style={{ flex: 1 }} onClick={() => setShowUploadModal(false)}></div>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>현장 데이터 업로드</h2>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>1. 전경 사진 (원거리)</span>
                  <span style={{ color: 'var(--brand-red)' }}>*필수</span>
                </label>
                <label style={{ height: '90px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', borderStyle: 'dashed', border: '1px dashed var(--border)', borderRadius: '12px', backgroundColor: photo1 ? 'rgba(255,42,42,0.08)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto1(e.target.files?.[0] ?? null)} />
                  <Camera size={24} color={photo1 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '13px', color: photo1 ? 'var(--brand-red)' : 'var(--text-secondary)' }}>
                    {photo1 ? `✓ ${photo1.name}` : '탭하여 촬영 또는 파일 선택'}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>2. 상세 사진 (근거리)</span>
                  <span style={{ color: 'var(--brand-red)' }}>*필수</span>
                </label>
                <label style={{ height: '90px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', borderStyle: 'dashed', border: '1px dashed var(--border)', borderRadius: '12px', backgroundColor: photo2 ? 'rgba(255,42,42,0.08)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto2(e.target.files?.[0] ?? null)} />
                  <Camera size={24} color={photo2 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '13px', color: photo2 ? 'var(--brand-red)' : 'var(--text-secondary)' }}>
                    {photo2 ? `✓ ${photo2.name}` : '탭하여 촬영 또는 파일 선택'}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600 }}>현장 메모</label>
                <textarea
                  placeholder="예: 우측 지하주차장 입구 1m 지점, 야간 식별 주의 등"
                  value={fieldNote}
                  onChange={e => setFieldNote(e.target.value)}
                  style={{ width: '100%', height: '90px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'white', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <button className="btn-primary"
                disabled={!photo1 || !photo2}
                onClick={async () => {
                  if (!selectedLocation || !photo1 || !photo2) return;

                  try {
                    // 파일 확장자를 보존하여 실제 파일 업로드
                    const ext1 = photo1.name.split('.').pop()?.toLowerCase() || 'jpg';
                    const ext2 = photo2.name.split('.').pop()?.toLowerCase() || 'jpg';
                    const path1 = `${selectedLocation.id}_1.${ext1}`;
                    const path2 = `${selectedLocation.id}_2.${ext2}`;

                    // Supabase Storage에 실제 파일 업로드 (upsert: 기존 파일 덮어쓰기)
                    const [upload1, upload2] = await Promise.all([
                      supabase.storage.from('building-photos').upload(path1, photo1, { upsert: true, contentType: photo1.type || `image/${ext1}` }),
                      supabase.storage.from('building-photos').upload(path2, photo2, { upsert: true, contentType: photo2.type || `image/${ext2}` }),
                    ]);

                    if (upload1.error) throw new Error('사진1 업로드 실패: ' + upload1.error.message);
                    if (upload2.error) throw new Error('사진2 업로드 실패: ' + upload2.error.message);

                    // DB에 파일 경로 및 메타데이터 저장
                    const { error: dbError } = await supabase
                      .from('buildings')
                      .update({
                        has_photos: true,
                        field_note: fieldNote,
                        registered_at: new Date().toISOString(),
                        photo1_path: path1,
                        photo2_path: path2,
                      })
                      .eq('id', selectedLocation.id);

                    if (dbError) throw new Error('정보 저장 실패: ' + dbError.message);

                    // 로컬 상태 업데이트 (즉시 사진 표시)
                    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
                    const ts = Date.now();
                    setSelectedLocation((prev: any) => prev ? {
                      ...prev,
                      has_photos: true,
                      field_note: fieldNote,
                      photo1_path: path1,
                      photo2_path: path2,
                      photo1_url: `${baseUrl}/storage/v1/object/public/building-photos/${path1}?t=${ts}`,
                      photo2_url: `${baseUrl}/storage/v1/object/public/building-photos/${path2}?t=${ts}`,
                    } : prev);

                    setPhoto1(null); setPhoto2(null); setFieldNote('');
                    setShowUploadModal(false);
                    fetchRegistry();
                  } catch (err: any) {
                    console.error('Upload error:', err);
                    alert('업로드 실패: ' + (err.message || '알 수 없는 오류'));
                  }
                }}>
                데이터 등록하기 {(!photo1 || !photo2) ? '(사진 2장 필수)' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 미등록 건물 현황 모달 (실데이터: localStorage registry) ── */}
      {showUnregistered && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>미등록 건물 현황</h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {registry.filter(r => !r.has_photos).length > 0
                    ? `방문한 건물 중 ${registry.filter(r => !r.has_photos).length}개 미등록`
                    : '지도에서 건물을 클릭하면 여기에 표시됩니다'}
                </p>
              </div>
              <button onClick={() => setShowUnregistered(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            {registry.filter(r => !r.has_photos).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                <AlertCircle size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <p>아직 방문한 건물이 없습니다.<br />지도에서 건물을 클릭해 보세요.</p>
              </div>
            ) : (
              registry.filter(r => !r.has_photos).map((b, i) => (
                <div key={i} onClick={() => { setShowUnregistered(false); handleMapClick({ latlng: { lat: b.lat, lng: b.lng } } as any); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: 'var(--surface)', borderRadius: '12px', marginBottom: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{b.address} · {b.floors}층</div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--brand-red)', fontWeight: 600 }}>미등록</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── 내 기여 현황 모달 (실데이터: localStorage registry) ── */}
      {showStats && (() => {
        const registered = registry.filter(r => r.has_photos);
        const unregistered = registry.filter(r => !r.has_photos);
        const thisMonth = registered.filter(r => r.registered_at && new Date(r.registered_at).getMonth() === new Date().getMonth());
        const lastBuilding = registered.sort((a, b) => (b.registered_at ?? '').localeCompare(a.registered_at ?? ''))[0];
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>내 기여 현황</h2>
                <button onClick={() => setShowStats(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
              </div>
              <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'var(--text-secondary)' }}>기기 ID: {deviceId.slice(0, 8)}... (이 기기의 누적 데이터)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {[
                  { label: '등록 완료 건물', value: registered.length, unit: '개' },
                  { label: '방문 건물', value: registry.length, unit: '개' },
                  { label: '미등록 건물', value: unregistered.length, unit: '개' },
                  { label: '이번 달 등록', value: thisMonth.length, unit: '건' },
                ].map((s, i) => (
                  <div key={i} style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--brand-red)' }}>{s.value}<span style={{ fontSize: '14px' }}>{s.unit}</span></div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>최근 등록 건물</div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '4px' }}>
                  {lastBuilding ? `${new Date(lastBuilding.registered_at!).toLocaleDateString('ko-KR')} — ${lastBuilding.name}` : '등록한 건물 없음'}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 오프라인 지도 다운로드 모달 ── */}
      {showOffline && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>오프라인 지도 다운로드</h2>
              <button onClick={() => setShowOffline(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>다운로드 구역</div>
              <div style={{ fontWeight: 600 }}>서울특별시 전체 (25개 자치구)</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>예상 용량: 약 340MB</div>
            </div>
            {offlineDownloading ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span>다운로드 중...</span><span style={{ color: 'var(--brand-red)', fontWeight: 700 }}>{offlineProgress}%</span>
                </div>
                <div style={{ backgroundColor: 'var(--surface)', borderRadius: '100px', height: '8px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${offlineProgress}%`, backgroundColor: 'var(--brand-red)', borderRadius: '100px', transition: 'width 0.3s' }} />
                </div>
              </div>
            ) : (
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => {
                setOfflineDownloading(true);
                setOfflineProgress(0);
                let p = 0;
                const t = setInterval(() => {
                  p += Math.floor(Math.random() * 8) + 3;
                  if (p >= 100) { p = 100; clearInterval(t); setOfflineDownloading(false); setOfflineProgress(0); setShowOffline(false); }
                  setOfflineProgress(p);
                }, 200);
              }}>
                <MapPinned size={18} /><span>다운로드 시작</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 송수관 촬영 가이드 모달 ── */}
      {showGuide && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>송수관 촬영 가이드</h2>
              <button onClick={() => setShowGuide(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            {[
              { step: '01', title: '전경 사진 (원거리)', desc: '건물 정면에서 5~10m 거리. 건물 입구와 송수관 위치가 함께 보이도록 촬영. 주간 자연광 권장.' },
              { step: '02', title: '상세 사진 (근거리)', desc: '송수관에서 1m 이내 접근. 연결구 구경, 잠금장치, 표지판이 모두 선명하게 보여야 함.' },
              { step: '03', title: '야간 보완 촬영', desc: '나무·차량으로 가려진 경우, 야간 가시성 확인용 추가 촬영. 플래시 사용 가능.' },
              { step: '04', title: '현장 메모 작성', desc: '위치 설명 필수 (예: 정문 왼쪽 1m, 지하주차장 입구 화단 옆). 장애물·식별 주의사항 기재.' },
            ].map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--brand-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: 700 }}>{g.step}</div>
                <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border)', flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>{g.title}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 관할 소방서 정보 모달 ── */}
      {showStation && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>관할 소방서 정보</h2>
              <button onClick={() => setShowStation(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ backgroundColor: 'rgba(255,42,42,0.1)', borderRadius: '12px', padding: '12px 16px', border: '1px solid rgba(255,42,42,0.3)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={18} color="var(--brand-red)" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>긴급출동 ☎ 119</span>
            </div>
            {[
              { name: '종로소방서', area: '종로구', tel: '02-737-0119', addr: '종로구 자하문로 19' },
              { name: '중부소방서', area: '중구', tel: '02-3705-0119', addr: '중구 퇴계로 34길 42' },
              { name: '서대문소방서', area: '서대문구', tel: '02-330-4119', addr: '서대문구 연희로 248' },
              { name: '마포소방서', area: '마포구', tel: '02-320-9119', addr: '마포구 월드컵로 190' },
              { name: '영등포소방서', area: '영등포구', tel: '02-2637-0119', addr: '영등포구 영등포로 369' },
              { name: '구로소방서', area: '구로구, 금천구', tel: '02-2618-0119', addr: '구로구 경인로 625' },
              { name: '동작소방서', area: '동작구', tel: '02-599-0119', addr: '동작구 노량진로 129' },
              { name: '성동소방서', area: '성동구', tel: '02-2291-0119', addr: '성동구 왕십리로 410' },
            ].map((s, i) => (
              <div key={i} style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{s.name}</div>
                  <a href={`tel:${s.tel}`} style={{ backgroundColor: 'var(--brand-red)', color: 'white', padding: '4px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>{s.tel}</a>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>관할: {s.area}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.addr}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
