// @ts-nocheck
"use client";

import { useState, useEffect, useRef } from 'react';
import { Camera, AlertCircle, Image as ImageIcon, MapPinned, Info, X, Loader2, LocateFixed, Menu, History, Search, Layers, Eye, Compass, Navigation } from 'lucide-react';
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
  photo3_path?: string;
}

interface SelectedLocation extends BuildingRecord {
  geojson: any;
  originalName: string;
  originalAddress: string;
  photo3_url?: string | null;
}

// ── Image with Circle Overlay Component ──
function ImageWithCircle({ src, circle, onCircleSet, isEditing, label, allowCircle = true }: { src: string, circle: { x: number, y: number } | null, onCircleSet: (pos: { x: number, y: number }) => void, isEditing: boolean, label: string, allowCircle?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleInteraction = (e: any) => {
    if (!isEditing) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

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
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', backgroundColor: '#000', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
      >
        <img
          src={src}
          style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
          alt={label}
          draggable={false}
        />
        {allowCircle && (
          <div
            onClick={(e) => isEditing && handleInteraction(e)}
            onTouchStart={(e) => isEditing && handleInteraction(e)}
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              cursor: isEditing ? 'crosshair' : 'default',
              touchAction: isEditing ? 'none' : 'auto',
              pointerEvents: isEditing ? 'auto' : 'none',
              zIndex: 10
            }}
          >
            {circle && (
              <>
                <div style={{
                  position: 'absolute',
                  left: `${circle.x * 100}%`,
                  top: `${circle.y * 100}%`,
                  width: '96px', height: '96px',
                  transform: 'translate(-50%, -50%)',
                  border: '6px solid #ff0000',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 0, 0, 0.2)',
                  pointerEvents: 'none'
                }} />
                <div style={{
                  position: 'absolute',
                  left: `${circle.x * 100}%`,
                  top: `${circle.y * 100}%`,
                  width: '128px', height: '128px',
                  transform: 'translate(-50%, -50%)',
                  border: '3px solid rgba(255, 0, 0, 0.4)',
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }} />
              </>
            )}
          </div>
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

export default function MapComponent() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const currentOverlaysRef = useRef<any[]>([]);

  // Split Roadview refs
  const roadviewContainerRef = useRef<HTMLDivElement>(null);
  const roadviewRef = useRef<any>(null);
  const roadviewClientRef = useRef<any>(null);
  const roadviewMarkerRef = useRef<any>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isSkyview, setIsSkyview] = useState(false);
  const [locating, setLocating] = useState(false);

  // ── 지도 + 로드뷰 동시 분할 모드 (Split View) 상태 ──
  const [isSplitRoadview, setIsSplitRoadview] = useState(false);
  const [roadviewLoading, setRoadviewLoading] = useState(false);
  const [roadviewAddress, setRoadviewAddress] = useState<string>('');
  const [roadviewError, setRoadviewError] = useState<string | null>(null);

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
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Search history in localStorage
  const [searchHistory, setSearchHistory] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fire-link-search-history');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('fire-link-search-history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  const addToHistory = (item: any) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(p => p.address?.parcel !== item.address?.parcel);
      return [item, ...filtered].slice(0, 10);
    });
  };

  // Building registry (real data from Supabase)
  const [registry, setRegistry] = useState<BuildingRecord[]>([]);

  // Device UUID
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
  const [photo3, setPhoto3] = useState<File | null>(null);
  const [fieldNote, setFieldNote] = useState('');

  // Wiki edit mode state
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Circle coordinates state
  const [p1Circle, setP1Circle] = useState<{ x: number, y: number } | null>(null);
  const [p2Circle, setP2Circle] = useState<{ x: number, y: number } | null>(null);
  const [isEditingCircles, setIsEditingCircles] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // ── 카카오 지도 스크립트 로드 및 초기화 ──
  useEffect(() => {
    const kakaoApiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || '273458bd7122bda4cfec7d99c5764bfc';

    const initKakao = () => {
      if (!window.kakao || !window.kakao.maps) return;
      window.kakao.maps.load(() => {
        if (!mapContainerRef.current) return;
        if (kakaoMapRef.current) return;

        const options = {
          center: new window.kakao.maps.LatLng(37.5665, 126.9780), // 서울 시청
          level: 3
        };
        const map = new window.kakao.maps.Map(mapContainerRef.current, options);
        kakaoMapRef.current = map;
        setMapLoaded(true);

        // 지도 클릭 시: 분할 로드뷰 모드일 때는 로드뷰 위치 이동, 일반 모드일 때는 건물 조회
        window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
          const latlng = mouseEvent.latLng;
          if (splitRoadviewRef.current) {
            moveToRoadview(latlng.getLat(), latlng.getLng());
          } else {
            handleLocationSelect(latlng.getLat(), latlng.getLng());
          }
        });
      });
    };

    if (window.kakao && window.kakao.maps) {
      initKakao();
    } else {
      const existingScript = document.getElementById('kakao-map-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'kakao-map-script';
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoApiKey}&autoload=false`;
        script.async = true;
        script.onload = () => initKakao();
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initKakao);
      }
    }
  }, []);

  // 분할 로드뷰 ref (이벤트 리스너 클로저 대응)
  const splitRoadviewRef = useRef(isSplitRoadview);
  useEffect(() => {
    splitRoadviewRef.current = isSplitRoadview;
  }, [isSplitRoadview]);

  // ── 카카오 지도 위에 GeoJSON 건물 폴리곤 그리기 ──
  const drawGeoJson = (geojson: any) => {
    const map = kakaoMapRef.current;
    if (!map || !window.kakao?.maps) return;

    currentOverlaysRef.current.forEach(item => item.setMap(null));
    currentOverlaysRef.current = [];

    if (!geojson) return;

    const { type, coordinates } = geojson;

    if (type === 'Polygon') {
      const paths = coordinates[0].map(([lng, lat]: [number, number]) => new window.kakao.maps.LatLng(lat, lng));
      const polygon = new window.kakao.maps.Polygon({
        path: paths,
        strokeWeight: 3,
        strokeColor: '#ff2a2a',
        strokeOpacity: 0.95,
        fillColor: '#ff2a2a',
        fillOpacity: 0.4
      });
      polygon.setMap(map);
      currentOverlaysRef.current.push(polygon);
    } else if (type === 'MultiPolygon') {
      coordinates.forEach((poly: any) => {
        const paths = poly[0].map(([lng, lat]: [number, number]) => new window.kakao.maps.LatLng(lat, lng));
        const polygon = new window.kakao.maps.Polygon({
          path: paths,
          strokeWeight: 3,
          strokeColor: '#ff2a2a',
          strokeOpacity: 0.95,
          fillColor: '#ff2a2a',
          fillOpacity: 0.4
        });
        polygon.setMap(map);
        currentOverlaysRef.current.push(polygon);
      });
    } else if (type === 'Point') {
      const [lng, lat] = coordinates;
      const circle = new window.kakao.maps.Circle({
        center: new window.kakao.maps.LatLng(lat, lng),
        radius: 12,
        strokeWeight: 2,
        strokeColor: '#ffffff',
        strokeOpacity: 1,
        fillColor: '#ff2a2a',
        fillOpacity: 0.8
      });
      circle.setMap(map);
      currentOverlaysRef.current.push(circle);
    }
  };

  // ── 위치 선택 및 V-World 건물 데이터 조회 ──
  const handleLocationSelect = async (lat: number, lng: number, shouldMoveMap = false) => {
    setIsLoading(true);
    setSelectedLocation(null);

    const map = kakaoMapRef.current;
    if (map && shouldMoveMap && window.kakao?.maps) {
      const targetLatLng = new window.kakao.maps.LatLng(lat, lng);
      map.panTo(targetLatLng);
    }

    try {
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

        const { data: existingData, error: fetchError } = await supabase
          .from('buildings')
          .select('*')
          .eq('id', bldId)
          .maybeSingle();

        const alreadyHasPhotos = existingData?.has_photos ?? false;
        const currentName = existingData?.user_edited_name || existingData?.name || bldName;
        const currentAddress = existingData?.user_edited_address || existingData?.address || bldAddr;
        const currentFloors = existingData?.floors || bldFloors || '?';

        try {
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
            await supabase.from('buildings').upsert(newRecord);
            fetchRegistry();
          }
        } catch (dbErr) {
          console.error('Database record error:', dbErr);
        }

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
        const buildPhotoUrl = (path: string | undefined | null) => {
          if (!path) return null;
          return `${baseUrl}/storage/v1/object/public/building-photos/${path}?t=${Date.now()}`;
        };
        const photo1_url = alreadyHasPhotos ? buildPhotoUrl(existingData?.photo1_path) : null;
        const photo2_url = alreadyHasPhotos ? buildPhotoUrl(existingData?.photo2_path) : null;
        const photo3_url = alreadyHasPhotos ? buildPhotoUrl(existingData?.photo3_path) : null;

        const locationData: SelectedLocation = {
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
          photo3_url,
          field_note: existingData?.field_note || '',
          photo1_x: existingData?.photo1_x,
          photo1_y: existingData?.photo1_y,
          photo2_x: existingData?.photo2_x,
          photo2_y: existingData?.photo2_y,
          photo1_path: existingData?.photo1_path,
          photo2_path: existingData?.photo2_path,
          photo3_path: existingData?.photo3_path,
          originalName: existingData?.name || bldName || '이름 없는 건물',
          originalAddress: existingData?.address || bldAddr || '주소 정보 없음'
        };

        setSelectedLocation(locationData);
        drawGeoJson(feature?.geometry);

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
        const threshold = 0.00015;
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
          drawGeoJson(null);
        } else {
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
          drawGeoJson(null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch location data:", error);
      alert('데이터를 불러오는데 실패했습니다.');
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

  // 현위치로 이동 (GPS)
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('GPS를 지원하지 않는 브라우저입니다.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (kakaoMapRef.current && window.kakao?.maps) {
          const loc = new window.kakao.maps.LatLng(latitude, longitude);
          kakaoMapRef.current.panTo(loc);
          kakaoMapRef.current.setLevel(2);
        }
      },
      (err) => {
        setLocating(false);
        console.error('Locate error:', err);
        alert('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 일반지도 <-> 스카이뷰(위성사진) 토글
  const toggleMapType = () => {
    const map = kakaoMapRef.current;
    if (!map || !window.kakao?.maps) return;

    if (isSkyview) {
      map.setMapTypeId(window.kakao.maps.MapTypeId.ROADMAP);
      setIsSkyview(false);
    } else {
      map.setMapTypeId(window.kakao.maps.MapTypeId.HYBRID);
      setIsSkyview(true);
    }
  };

  // 지도 확대 / 축소
  const handleZoom = (delta: number) => {
    const map = kakaoMapRef.current;
    if (!map) return;
    const currentLevel = map.getLevel();
    map.setLevel(currentLevel + delta);
  };

  // ════════════════════════════════════════════════════════════════════
  // ── 지도 + 로드뷰 동시 분할 모드 (Split View) 핵심 로직 ──
  // ════════════════════════════════════════════════════════════════════
  const openSplitRoadview = (targetLat?: number, targetLng?: number) => {
    const map = kakaoMapRef.current;
    if (!map || !window.kakao?.maps) return;

    // 분할 모드 켜기
    setIsSplitRoadview(true);

    // 파란색 로드뷰 도로망 라인 지도에 오버레이
    map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);

    // 지도 리사이즈 트리거
    setTimeout(() => {
      map.relayout();
      const lat = targetLat || (selectedLocation ? selectedLocation.lat : map.getCenter().getLat());
      const lng = targetLng || (selectedLocation ? selectedLocation.lng : map.getCenter().getLng());
      initOrMoveRoadview(lat, lng);
    }, 150);
  };

  const closeSplitRoadview = () => {
    const map = kakaoMapRef.current;
    if (map && window.kakao?.maps) {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
      setTimeout(() => {
        map.relayout();
      }, 150);
    }

    if (roadviewMarkerRef.current) {
      roadviewMarkerRef.current.setMap(null);
      roadviewMarkerRef.current = null;
    }

    setIsSplitRoadview(false);
  };

  // 로드뷰 인스턴스 초기화 또는 특정 좌표로 이동
  const initOrMoveRoadview = (lat: number, lng: number) => {
    if (!window.kakao?.maps || !roadviewContainerRef.current) return;
    const map = kakaoMapRef.current;

    setRoadviewLoading(true);
    setRoadviewError(null);

    const position = new window.kakao.maps.LatLng(lat, lng);

    if (!roadviewClientRef.current) {
      roadviewClientRef.current = new window.kakao.maps.RoadviewClient();
    }
    const roadviewClient = roadviewClientRef.current;

    // 가장 가까운 파노라마 ID 검색 (반경 100m)
    roadviewClient.getNearestPanoId(position, 100, (panoId: any) => {
      setRoadviewLoading(false);
      if (panoId) {
        if (!roadviewRef.current) {
          const rv = new window.kakao.maps.Roadview(roadviewContainerRef.current);
          roadviewRef.current = rv;

          // 로드뷰 시점 회전 시 지도 위 마커 화살표 동기화
          window.kakao.maps.event.addListener(rv, 'viewpoint_changed', () => {
            const viewpoint = rv.getViewpoint();
            updateRoadviewMarkerAngle(viewpoint.pan);
          });

          // 로드뷰 내에서 도로 화살표 눌러서 이동 시 지도 마커 동기화
          window.kakao.maps.event.addListener(rv, 'position_changed', () => {
            const rvPos = rv.getPosition();
            if (map) {
              map.panTo(rvPos);
              updateRoadviewMarkerPosition(rvPos);
            }
          });
        }

        roadviewRef.current.setPanoId(panoId, position);
        updateRoadviewMarkerPosition(position);

        if (map) {
          map.panTo(position);
        }
      } else {
        setRoadviewError('선택한 지점 반경 100m 내에 카카오 로드뷰 도로가 없습니다. 파란색 도로 위를 터치해 주세요.');
      }
    });
  };

  const moveToRoadview = (lat: number, lng: number) => {
    initOrMoveRoadview(lat, lng);
  };

  // 지도 위 로드뷰 시점 마커 (화살표 포함) 갱신
  const updateRoadviewMarkerPosition = (latlng: any) => {
    const map = kakaoMapRef.current;
    if (!map || !window.kakao?.maps) return;

    if (!roadviewMarkerRef.current) {
      const markerContent = document.createElement('div');
      markerContent.id = 'roadview-walker-marker';
      markerContent.style.cssText = `
        width: 32px; height: 32px;
        background: rgba(255, 42, 42, 0.9);
        border: 2px solid white;
        border-radius: 50%;
        display: flex; justify-content: center; align-items: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        transform: rotate(0deg);
        transition: transform 0.1s ease;
      `;
      markerContent.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L19 21L12 17L5 21L12 2Z"/></svg>`;

      const customOverlay = new window.kakao.maps.CustomOverlay({
        position: latlng,
        content: markerContent,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 2000
      });
      customOverlay.setMap(map);
      roadviewMarkerRef.current = customOverlay;
    } else {
      roadviewMarkerRef.current.setPosition(latlng);
    }
  };

  const updateRoadviewMarkerAngle = (pan: number) => {
    const markerEl = document.getElementById('roadview-walker-marker');
    if (markerEl) {
      markerEl.style.transform = `rotate(${pan}deg)`;
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── [분할 모드 상단] 360° 로드뷰 뷰어 창 (모바일 44% 높이) ── */}
      {isSplitRoadview && (
        <div style={{
          width: '100%',
          height: '44%',
          position: 'relative',
          backgroundColor: '#000',
          borderBottom: '2px solid var(--brand-red)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          zIndex: 100
        }}>
          {/* 상단 툴바 안내선 */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            padding: '8px 16px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', backgroundColor: 'var(--brand-red)', color: 'white', padding: '2px 8px', borderRadius: '100px', fontWeight: 800 }}>
                360° 로드뷰 동시 보기
              </span>
              <span style={{ fontSize: '12px', color: 'white', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                아래 지도에서 원하는 골목을 찍으면 즉시 이동합니다
              </span>
            </div>
            <button
              onClick={closeSplitRoadview}
              style={{
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
              title="로드뷰 닫기 (전체 지도로 복귀)"
            >
              <X size={18} />
            </button>
          </div>

          {/* 로드뷰 DOM 컨테이너 */}
          <div ref={roadviewContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* 로드뷰 로딩 인디케이터 */}
          {roadviewLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10 }}>
              <Loader2 size={32} color="var(--brand-red)" className="animate-spin" style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
              <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>현장 로드뷰 로딩 중...</span>
            </div>
          )}

          {/* 로드뷰 에러 알림 배너 */}
          {roadviewError && (
            <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px', backgroundColor: 'rgba(255,42,42,0.9)', color: 'white', padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{roadviewError}</span>
              <button onClick={() => setRoadviewError(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* ── [지도 컨테이너] (분할 모드 시 56% 높이, 평소 100%) ── */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: isSplitRoadview ? '56%' : '100%' }}>
        <div
          ref={mapContainerRef}
          style={{ width: '100%', height: '100%', backgroundColor: '#1a1d24' }}
        />

        {/* ── 지도 우측 컨트롤 (위성 스카이뷰 / 360 로드뷰 분할 토글 / 줌 / 현위치) ── */}
        <div style={{ position: 'absolute', bottom: isSplitRoadview ? '20px' : '140px', right: '14px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', transition: 'bottom 0.3s ease' }}>
          
          {/* 360° 로드뷰 동시 분할 토글 버튼 */}
          <button
            className="glass btn-hover-effect"
            onClick={() => {
              if (isSplitRoadview) {
                closeSplitRoadview();
              } else {
                openSplitRoadview();
              }
            }}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              border: isSplitRoadview ? '2px solid #00c853' : '1px solid var(--border)',
              backgroundColor: isSplitRoadview ? 'rgba(0, 200, 83, 0.25)' : 'var(--surface)',
              cursor: 'pointer',
              padding: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            title={isSplitRoadview ? "로드뷰 닫기" : "지도+로드뷰 동시 보기"}
          >
            <Compass size={18} color={isSplitRoadview ? "#00e676" : "var(--text-primary)"} />
            <span style={{ fontSize: '9px', fontWeight: 700, color: isSplitRoadview ? "#00e676" : "var(--text-secondary)", marginTop: '1px' }}>
              로드뷰
            </span>
          </button>

          {/* 스카이뷰(위성사진) 토글 버튼 */}
          <button
            className="glass btn-hover-effect"
            onClick={toggleMapType}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              border: isSkyview ? '2px solid var(--brand-red)' : '1px solid var(--border)',
              backgroundColor: isSkyview ? 'rgba(255,42,42,0.2)' : 'var(--surface)',
              cursor: 'pointer',
              padding: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            title={isSkyview ? "일반지도로 전환" : "위성 스카이뷰로 전환"}
          >
            <Layers size={18} color={isSkyview ? "var(--brand-red)" : "var(--text-primary)"} />
            <span style={{ fontSize: '9px', fontWeight: 700, color: isSkyview ? "var(--brand-red)" : "var(--text-secondary)", marginTop: '1px' }}>
              {isSkyview ? "위성" : "지도"}
            </span>
          </button>

          {/* 줌 확대/축소 */}
          <div className="glass" style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            <button
              onClick={() => handleZoom(-1)}
              style={{ width: '42px', height: '36px', background: 'var(--surface)', border: 'none', borderBottom: '1px solid var(--border)', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              +
            </button>
            <button
              onClick={() => handleZoom(1)}
              style={{ width: '42px', height: '36px', background: 'var(--surface)', border: 'none', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              -
            </button>
          </div>

          {/* 현위치 (GPS) 버튼 */}
          <button
            className="glass btn-hover-effect"
            onClick={handleLocateMe}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              backgroundColor: 'var(--surface)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            title="내 위치 찾기"
          >
            <LocateFixed size={20} color={locating ? "var(--brand-red)" : "var(--text-primary)"} className={locating ? "animate-pulse" : ""} />
          </button>
        </div>

        {/* ── Top Bar - Branded Glassmorphism ── */}
        {!isSplitRoadview && (
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
              <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '-0.5px', color: 'white' }}>
                파이어링크 <span style={{ color: 'var(--brand-red)', fontSize: '11px', verticalAlign: 'top', fontWeight: 500 }}>SEOUL</span>
              </h1>
              <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>건물 연결송수관 설비 정보 시스템 · 카카오맵 연동</p>
            </div>
            <button
              onClick={() => setShowMenu(true)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center' }}
            >
              <Menu size={20} />
            </button>
          </div>
        )}

        {/* ── Search Bar & Recent History ── */}
        {!isSplitRoadview && (
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
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
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

            {/* 검색 결과 및 최근 검색 기록 드롭다운 */}
            {(searchResults.length > 0 || (isSearchFocused && searchHistory.length > 0 && searchQuery === '')) && (
              <div className="glass-panel" style={{ borderRadius: '16px', overflow: 'hidden', maxHeight: '250px', overflowY: 'auto', marginTop: '4px' }}>
                {searchResults.length === 0 && (
                  <div style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                    최근 검색 기록
                  </div>
                )}
                {(searchResults.length > 0 ? searchResults : searchHistory).map((result, idx) => (
                  <div
                    key={idx}
                    onClick={async () => {
                      const lat = parseFloat(result.point.y);
                      const lng = parseFloat(result.point.x);
                      if (searchResults.length > 0) addToHistory(result);
                      setSearchResults([]);
                      setSearchQuery('');
                      await handleLocationSelect(lat, lng, true);
                    }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: idx < (searchResults.length > 0 ? searchResults.length : searchHistory.length) - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                    className="btn-hover-effect"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {searchResults.length === 0 && <History size={14} color="var(--text-secondary)" />}
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>
                        {result.address?.road || result.address?.parcel || '주소 정보'}
                      </span>
                    </div>
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
        )}

        {/* ── Branded Loading Overlay ── */}
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
            <span style={{ color: 'white', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.5px' }}>건물 설비 데이터 분석 중...</span>
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

        {/* ── Bottom Sheet - Details View ── */}
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: (selectedLocation && !isSplitRoadview) ? '0' : '-100%',
            left: '0',
            width: '100%',
            zIndex: 1000,
            transition: 'bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: '24px',
            paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 40px))',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, marginRight: '8px' }}>
                  {isEditing ? (
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

                              setSelectedLocation((prev: any) => ({
                                ...prev,
                                name: updatedName || prev.originalName || prev.name,
                                address: updatedAddr || prev.originalAddress || prev.address,
                                user_edited_name: updatedName || null,
                                user_edited_address: updatedAddr || null
                              }));

                              setIsEditing(false);
                              await fetchRegistry();
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
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <MapPinned size={18} color="var(--brand-red)" />
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{selectedLocation.name}</h2>
                        <button
                          title="건물 정보 수정"
                          onClick={() => { setEditName(selectedLocation.name === '이름 없는 건물' ? '' : selectedLocation.name); setEditAddress(selectedLocation.address === '주소 정보 없음' ? '' : selectedLocation.address); setIsEditing(true); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', opacity: 0.6, display: 'flex', alignItems: 'center' }}
                        >
                          ✏️
                        </button>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', wordBreak: 'keep-all' }}>{selectedLocation.address}</p>
                      {registry.find(r => r.id === selectedLocation.id)?.user_edited_name && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', backgroundColor: 'rgba(30,120,255,0.15)', border: '1px solid rgba(30,120,255,0.3)', borderRadius: '100px', padding: '2px 8px' }}>
                          <span style={{ fontSize: '10px', color: '#6ea8fe' }}>🔵 대원 편집됨 · {new Date(registry.find(r => r.id === selectedLocation.id)!.edited_at!).toLocaleDateString('ko-KR')}</span>
                        </div>
                      )}

                      {/* ── 현장 360° 로드뷰 동시 분할 뷰 열기 버튼 ── */}
                      <div style={{ marginTop: '10px' }}>
                        <button
                          onClick={() => openSplitRoadview(selectedLocation.lat, selectedLocation.lng)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '100px',
                            backgroundColor: 'rgba(255, 42, 42, 0.15)',
                            border: '1px solid var(--brand-red)',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          className="btn-hover-effect"
                        >
                          <Compass size={16} color="var(--brand-red)" />
                          <span>현장 360° 로드뷰 동시 확인</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedLocation(null); setIsEditing(false); drawGeoJson(null); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                >
                  <X size={24} />
                </button>
              </div>

              {selectedLocation.has_photos ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

                  {/* ── 사진 수직 배치 (원본 비율 유지) ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <ImageWithCircle
                      label="1. 건물 전체 전경 (송수구 위치 표시)"
                      src={selectedLocation.photo1_url || "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80"}
                      circle={p1Circle}
                      onCircleSet={(pos) => setP1Circle(pos)}
                      isEditing={isEditingCircles}
                      allowCircle={true}
                    />
                    <ImageWithCircle
                      label="2. 설비 근접 사진 (상세 위치)"
                      src={selectedLocation.photo2_url || "https://images.unsplash.com/photo-1621245059942-0fbc35851de9?w=800&auto=format&fit=crop&q=80"}
                      circle={p2Circle}
                      onCircleSet={(pos) => setP2Circle(pos)}
                      isEditing={isEditingCircles}
                      allowCircle={false}
                    />
                    {selectedLocation.photo3_url && (
                      <ImageWithCircle
                        label="3. 지도 방면 표시 사진"
                        src={selectedLocation.photo3_url}
                        circle={null}
                        onCircleSet={() => {}}
                        isEditing={false}
                        allowCircle={false}
                      />
                    )}
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
      </div>

      {/* ── 현장 데이터 업로드 모달 (개선: 1장만 있어도 등록 가능 & upsert 안전 저장) ── */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)',
          zIndex: 4000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end'
        }}>
          <div style={{ flex: 1 }} onClick={() => !isUploading && setShowUploadModal(false)}></div>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>현장 사진 및 설비 등록</h2>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {selectedLocation?.name} · 최소 1장 이상 등록 가능
                </p>
              </div>
              <button disabled={isUploading} onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* 사진 1 (전경) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>1. 건물 전체 전경 사진</span>
                  <span style={{ color: 'var(--brand-red)', fontSize: '11px' }}>권장</span>
                </label>
                <label style={{ height: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px dashed var(--border)', borderRadius: '12px', backgroundColor: photo1 ? 'rgba(255,42,42,0.1)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto1(e.target.files?.[0] ?? null)} />
                  <Camera size={22} color={photo1 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '12px', color: photo1 ? 'var(--brand-red)' : 'var(--text-secondary)', fontWeight: photo1 ? 700 : 400 }}>
                    {photo1 ? `✓ ${photo1.name}` : '탭하여 촬영 또는 앨범 선택'}
                  </span>
                </label>
              </div>

              {/* 사진 2 (상세) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>2. 송수관 근접 상세 사진</span>
                  <span style={{ color: 'var(--brand-red)', fontSize: '11px' }}>권장</span>
                </label>
                <label style={{ height: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px dashed var(--border)', borderRadius: '12px', backgroundColor: photo2 ? 'rgba(255,42,42,0.1)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto2(e.target.files?.[0] ?? null)} />
                  <Camera size={22} color={photo2 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '12px', color: photo2 ? 'var(--brand-red)' : 'var(--text-secondary)', fontWeight: photo2 ? 700 : 400 }}>
                    {photo2 ? `✓ ${photo2.name}` : '탭하여 촬영 또는 앨범 선택'}
                  </span>
                </label>
              </div>

              {/* 사진 3 (지도 방면 표시 캡쳐) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>3. 지도 방면 표시 사진 (캡쳐 등)</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>선택</span>
                </label>
                <label style={{ height: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px dashed var(--border)', borderRadius: '12px', backgroundColor: photo3 ? 'rgba(255,42,42,0.1)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto3(e.target.files?.[0] ?? null)} />
                  <Camera size={22} color={photo3 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '12px', color: photo3 ? 'var(--brand-red)' : 'var(--text-secondary)', fontWeight: photo3 ? 700 : 400 }}>
                    {photo3 ? `✓ ${photo3.name}` : '탭하여 지도 캡쳐 첨부'}
                  </span>
                </label>
              </div>

              {/* 현장 메모 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>현장 특이사항 메모</label>
                <textarea
                  placeholder="예: 우측 지하주차장 입구 1m 화단 뒤, 야간 식별 주의 등"
                  value={fieldNote}
                  onChange={e => setFieldNote(e.target.value)}
                  style={{ width: '100%', height: '70px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', color: 'white', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', fontSize: '13px' }}
                />
              </div>

              {/* 등록 버튼 (최소 1장 이상이면 활성화!) */}
              <button
                className="btn-primary"
                disabled={(!photo1 && !photo2 && !photo3) || isUploading}
                style={{ height: '48px', fontSize: '15px', fontWeight: 700 }}
                onClick={async () => {
                  if (!selectedLocation || (!photo1 && !photo2 && !photo3)) return;

                  setIsUploading(true);
                  try {
                    const uploadPromises = [];
                    let path1 = selectedLocation.photo1_path;
                    let path2 = selectedLocation.photo2_path;
                    let path3 = selectedLocation.photo3_path;

                    if (photo1) {
                      const ext1 = photo1.name.split('.').pop()?.toLowerCase() || 'jpg';
                      path1 = `${selectedLocation.id}_1.${ext1}`;
                      uploadPromises.push(
                        supabase.storage.from('building-photos').upload(path1, photo1, { upsert: true, contentType: photo1.type || `image/${ext1}` })
                      );
                    }

                    if (photo2) {
                      const ext2 = photo2.name.split('.').pop()?.toLowerCase() || 'jpg';
                      path2 = `${selectedLocation.id}_2.${ext2}`;
                      uploadPromises.push(
                        supabase.storage.from('building-photos').upload(path2, photo2, { upsert: true, contentType: photo2.type || `image/${ext2}` })
                      );
                    }

                    if (photo3) {
                      const ext3 = photo3.name.split('.').pop()?.toLowerCase() || 'jpg';
                      path3 = `${selectedLocation.id}_3.${ext3}`;
                      uploadPromises.push(
                        supabase.storage.from('building-photos').upload(path3, photo3, { upsert: true, contentType: photo3.type || `image/${ext3}` })
                      );
                    }

                    // 파일 업로드 수행
                    const results = await Promise.all(uploadPromises);
                    for (const res of results) {
                      if (res.error) throw new Error('사진 파일 업로드 실패: ' + res.error.message);
                    }

                    // DB에 upsert (행이 없더라도 새로 생성하여 안전 저장!)
                    const saveData = {
                      id: selectedLocation.id,
                      name: selectedLocation.originalName || selectedLocation.name,
                      address: selectedLocation.originalAddress || selectedLocation.address,
                      lat: selectedLocation.lat,
                      lng: selectedLocation.lng,
                      floors: String(selectedLocation.floors || '?'),
                      has_photos: true,
                      field_note: fieldNote || selectedLocation.field_note || '',
                      registered_at: new Date().toISOString(),
                      visited_at: new Date().toISOString(),
                      device_id: deviceId,
                      ...(path1 ? { photo1_path: path1 } : {}),
                      ...(path2 ? { photo2_path: path2 } : {}),
                      ...(path3 ? { photo3_path: path3 } : {})
                    };

                    const { error: dbError } = await supabase
                      .from('buildings')
                      .upsert(saveData);

                    if (dbError) throw new Error('DB 저장 실패: ' + dbError.message);

                    // 로컬 뷰 즉시 반영
                    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
                    const ts = Date.now();
                    setSelectedLocation((prev: any) => prev ? {
                      ...prev,
                      has_photos: true,
                      field_note: fieldNote || prev.field_note,
                      photo1_path: path1,
                      photo2_path: path2,
                      photo3_path: path3,
                      photo1_url: path1 ? `${baseUrl}/storage/v1/object/public/building-photos/${path1}?t=${ts}` : prev.photo1_url,
                      photo2_url: path2 ? `${baseUrl}/storage/v1/object/public/building-photos/${path2}?t=${ts}` : prev.photo2_url,
                      photo3_url: path3 ? `${baseUrl}/storage/v1/object/public/building-photos/${path3}?t=${ts}` : prev.photo3_url,
                    } : prev);

                    setPhoto1(null); setPhoto2(null); setPhoto3(null); setFieldNote('');
                    setShowUploadModal(false);
                    await fetchRegistry();
                    alert('사진 및 현장 데이터가 성공적으로 등록되었습니다! 🚒');
                  } catch (err: any) {
                    console.error('Upload error:', err);
                    alert('업로드 실패: ' + (err.message || '알 수 없는 오류'));
                  } finally {
                    setIsUploading(false);
                  }
                }}
              >
                {isUploading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>서버에 안전하게 저장 중...</span>
                  </div>
                ) : (
                  <span>
                    데이터 등록 완료 {(!photo1 && !photo2 && !photo3) ? '(사진 최소 1장 필수)' : ''}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Side Menu Drawer ── */}
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
              Fire-Link: Seoul v1.2 (Kakao Live Split Roadview)
            </div>
          </div>
        </div>
      )}

      {/* ── 미등록 건물 현황 모달 ── */}
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
                <div key={i} onClick={() => { setShowUnregistered(false); handleLocationSelect(b.lat, b.lng, true); }}
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

      {/* ── 내 기여 현황 모달 ── */}
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
