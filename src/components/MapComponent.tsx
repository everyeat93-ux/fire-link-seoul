// @ts-nocheck
"use client";

import { useState, useEffect, useRef } from 'react';
import { Camera, AlertCircle, Image as ImageIcon, MapPinned, Info, X, Loader2, LocateFixed, Menu, History, Search, Layers, Eye, Compass, Building, Calendar, ShieldCheck, Ruler, CheckCircle2, ChevronUp, ChevronDown, Edit3, FileText, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface BuildingRecord {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  floors?: string;
  ugrnd_flr?: string;
  totar?: string;
  useapr_day?: string;
  structure?: string;
  purpose?: string;
  road_address?: string;
  jibun_address?: string;
  has_photos: boolean;
  visited_at: string;
  registered_at?: string;
  user_edited_name?: string;
  user_edited_address?: string;
  edited_by?: string;
  edited_at?: string;
  photo1_x?: number;
  photo1_y?: number;
  photo2_x?: number;
  photo2_y?: number;
  field_note?: string;
  photo1_path?: string;
  photo2_path?: string;
  photo3_path?: string;
}

interface SelectedLocation extends BuildingRecord {
  photo1_url?: string | null;
  photo2_url?: string | null;
  photo3_url?: string | null;
}

// ── 퀵 위치 태그 목록 (소방관용 원터치 입력) ──
const QUICK_TAGS = [
  '정문 우측', '정문 좌측', '주차장 입구', '화단 뒤쪽',
  '가로수 가림', '야간 식별 주의', '쌍구형(65mm)', '단구형', '불법주차 잦음'
];

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
  const geocoderRef = useRef<any>(null);
  const currentMarkerRef = useRef<any>(null);

  // Split Roadview refs
  const roadviewContainerRef = useRef<HTMLDivElement>(null);
  const roadviewRef = useRef<any>(null);
  const roadviewClientRef = useRef<any>(null);
  const roadviewMarkerRef = useRef<any>(null);

  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false); // 상세 정보 및 사진 펼치기
  const [showEditModal, setShowEditModal] = useState(false);     // 정보/사진 직접 입력/제보 모달
  const [isUploading, setIsUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isSkyview, setIsSkyview] = useState(false);
  const [locating, setLocating] = useState(false);

  // ── 지도 + 로드뷰 동시 분할 모드 (클릭했을 때만 활성화!) ──
  const [isSplitRoadview, setIsSplitRoadview] = useState(false);
  const [roadviewLoading, setRoadviewLoading] = useState(false);
  const [roadviewError, setRoadviewError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Menu states
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showStation, setShowStation] = useState(false);

  // Search history in localStorage (안전한 문자열 변환 적용)
  const [searchHistory, setSearchHistory] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fire-link-search-history');
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(item => {
            if (!item || typeof item !== 'object') return null;
            // 과거 V-World 버전 등에서 저장된 주소 객체 { road, parcel } 완벽 정제
            const addressStr = typeof item.address === 'string'
              ? item.address
              : (item.address?.road || item.address?.parcel || item.road_address_name || item.address_name || '');
            const nameStr = item.name || item.place_name || item.title || addressStr || '위치 정보';
            const xVal = item.x || item.point?.x || '';
            const yVal = item.y || item.point?.y || '';
            return {
              name: String(nameStr),
              place_name: String(nameStr),
              address: String(addressStr),
              road_address_name: String(addressStr),
              address_name: String(addressStr),
              x: String(xVal),
              y: String(yVal),
            };
          }).filter(Boolean);
        }
      } catch (e) {
        console.error('검색 기록 로드 오류:', e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('fire-link-search-history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  const addToHistory = (item: any) => {
    if (!item) return;
    const addressStr = typeof item.address === 'string'
      ? item.address
      : (item.road_address_name || item.address_name || (typeof item.address === 'object' ? (item.address?.road || item.address?.parcel) : '') || '');
    const nameStr = item.name || item.place_name || item.title || addressStr || '검색 기록';
    const xVal = item.x || item.point?.x || '';
    const yVal = item.y || item.point?.y || '';

    const cleanItem = {
      name: String(nameStr),
      place_name: String(nameStr),
      address: String(addressStr),
      road_address_name: String(addressStr),
      address_name: String(addressStr),
      x: String(xVal),
      y: String(yVal),
    };

    setSearchHistory(prev => {
      const filtered = prev.filter(p => p.address !== cleanItem.address && p.name !== cleanItem.name);
      return [cleanItem, ...filtered].slice(0, 10);
    });
  };

  // Building registry (Supabase DB)
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

  // ── 대원/제보자가 직접 입력하는 폼 상태 ──
  const [formName, setFormName] = useState('');
  const [formRoadAddress, setFormRoadAddress] = useState('');
  const [formJibunAddress, setFormJibunAddress] = useState('');
  const [formGrndFlr, setFormGrndFlr] = useState('');
  const [formUgrndFlr, setFormUgrndFlr] = useState('');
  const [formTotar, setFormTotar] = useState('');
  const [formUseaprDay, setFormUseaprDay] = useState('');
  const [formStructure, setFormStructure] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formFieldNote, setFormFieldNote] = useState('');

  // 사진 업로드 상태
  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [photo3, setPhoto3] = useState<File | null>(null);

  // 위치 동그라미 지정 상태
  const [p1Circle, setP1Circle] = useState<{ x: number, y: number } | null>(null);
  const [p2Circle, setP2Circle] = useState<{ x: number, y: number } | null>(null);
  const [isEditingCircles, setIsEditingCircles] = useState(false);

  // ── 카카오 지도 스크립트 로드 및 초기화 ──
  useEffect(() => {
    const kakaoApiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || '273458bd7122bda4cfec7d99c5764bfc';

    const initKakao = () => {
      if (!window.kakao || !window.kakao.maps) return;
      window.kakao.maps.load(() => {
        if (!mapContainerRef.current) return;
        if (kakaoMapRef.current) return;

        const options = {
          center: new window.kakao.maps.LatLng(37.5665, 126.9780),
          level: 3
        };
        const map = new window.kakao.maps.Map(mapContainerRef.current, options);
        kakaoMapRef.current = map;
        geocoderRef.current = new window.kakao.maps.services.Geocoder();

        // 지도 클릭 시
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
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoApiKey}&autoload=false&libraries=services`;
        script.async = true;
        script.onload = () => initKakao();
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initKakao);
      }
    }
  }, []);

  const splitRoadviewRef = useRef(isSplitRoadview);
  useEffect(() => {
    splitRoadviewRef.current = isSplitRoadview;
  }, [isSplitRoadview]);

  // ── 카카오 지오코더 기반 0.05초 초고속 건물 정보 매핑 ──
  const handleLocationSelect = async (lat: number, lng: number, shouldMoveMap = false) => {
    const map = kakaoMapRef.current;
    if (map && shouldMoveMap && window.kakao?.maps) {
      map.panTo(new window.kakao.maps.LatLng(lat, lng));
    }

    const posId = `bld_${lat.toFixed(5)}_${lng.toFixed(5)}`;

    // 지도 위 선택 마커 찍기
    if (map && window.kakao?.maps) {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setMap(null);
      }
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(lat, lng),
        map: map
      });
      currentMarkerRef.current = marker;
    }

    // 1. 카카오 지오코더로 도로명/지번/건물명 0.05초 즉시 역지오코딩
    if (geocoderRef.current) {
      geocoderRef.current.coord2Address(lng, lat, async (result: any, status: any) => {
        let bldName = '선택한 위치';
        let roadAddr = '';
        let jibunAddr = '';

        if (status === window.kakao.maps.services.Status.OK && result[0]) {
          roadAddr = result[0].road_address?.address_name || '';
          jibunAddr = result[0].address?.address_name || '';
          bldName = result[0].road_address?.building_name || roadAddr || jibunAddr || '건물';
        }

        // 2. Supabase에서 대원들이 등록한 현장 데이터 조회 (ID 또는 근사 좌표)
        const threshold = 0.0002;
        const existingData = registry.find(r =>
          r.id === posId ||
          (Math.abs(r.lat - lat) < threshold && Math.abs(r.lng - lng) < threshold)
        );

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
        const buildPhotoUrl = (path: string | undefined | null) => {
          if (!path) return null;
          return `${baseUrl}/storage/v1/object/public/building-photos/${path}?t=${Date.now()}`;
        };

        const locationData: SelectedLocation = {
          id: existingData?.id || posId,
          lat, lng,
          name: existingData?.user_edited_name || existingData?.name || bldName,
          address: existingData?.user_edited_address || roadAddr || jibunAddr || '주소 정보 없음',
          road_address: roadAddr,
          jibun_address: jibunAddr,
          floors: existingData?.floors || '',
          ugrnd_flr: existingData?.ugrnd_flr || '',
          totar: existingData?.totar || '',
          useapr_day: existingData?.useapr_day || '',
          structure: existingData?.structure || '',
          purpose: existingData?.purpose || '',
          has_photos: !!existingData?.has_photos,
          photo1_url: buildPhotoUrl(existingData?.photo1_path),
          photo2_url: buildPhotoUrl(existingData?.photo2_path),
          photo3_url: buildPhotoUrl(existingData?.photo3_path),
          photo1_path: existingData?.photo1_path,
          photo2_path: existingData?.photo2_path,
          photo3_path: existingData?.photo3_path,
          field_note: existingData?.field_note || '',
          photo1_x: existingData?.photo1_x,
          photo1_y: existingData?.photo1_y,
          photo2_x: existingData?.photo2_x,
          photo2_y: existingData?.photo2_y,
          visited_at: new Date().toISOString()
        };

        setSelectedLocation(locationData);
        setShowDetailSheet(false); // 기본 상태는 슬림 미니 바!

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
      });
    }
  };

  // ── 카카오 키워드/주소 검색 (에러 방어 및 폴백 지원) ──
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    try {
      if (typeof window !== 'undefined' && window.kakao?.maps?.services?.Places) {
        const places = new window.kakao.maps.services.Places();
        places.keywordSearch(query, (data: any, status: any) => {
          if (status === window.kakao.maps.services.Status.OK && data && data.length > 0) {
            setIsSearching(false);
            setSearchResults(data);
          } else if (geocoderRef.current) {
            // 주소 검색 재시도
            geocoderRef.current.addressSearch(query, (addrData: any, addrStatus: any) => {
              setIsSearching(false);
              if (addrStatus === window.kakao.maps.services.Status.OK && addrData && addrData.length > 0) {
                setSearchResults(addrData.map((item: any) => ({
                  place_name: item.road_address?.building_name || item.address_name,
                  address_name: item.address_name,
                  road_address_name: item.road_address?.address_name,
                  x: item.x,
                  y: item.y
                })));
              } else {
                setSearchResults([]);
                alert('검색 결과가 없습니다.');
              }
            });
          } else {
            setIsSearching(false);
            setSearchResults([]);
            alert('검색 결과가 없습니다.');
          }
        });
      } else if (geocoderRef.current) {
        geocoderRef.current.addressSearch(query, (addrData: any, addrStatus: any) => {
          setIsSearching(false);
          if (addrStatus === window.kakao.maps.services.Status.OK && addrData && addrData.length > 0) {
            setSearchResults(addrData.map((item: any) => ({
              place_name: item.road_address?.building_name || item.address_name,
              address_name: item.address_name,
              road_address_name: item.road_address?.address_name,
              x: item.x,
              y: item.y
            })));
          } else {
            setSearchResults([]);
            alert('검색 결과가 없습니다.');
          }
        });
      } else {
        setIsSearching(false);
      }
    } catch (err) {
      console.error('검색 실행 오류:', err);
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

  const handleZoom = (delta: number) => {
    const map = kakaoMapRef.current;
    if (!map) return;
    map.setLevel(map.getLevel() + delta);
  };

  // ════════════════════════════════════════════════════════════════════
  // ── [로드뷰] 사용자가 직접 눌렀을 때만 분할 뷰 열기! ──
  // ════════════════════════════════════════════════════════════════════
  const openSplitRoadview = (targetLat?: number, targetLng?: number) => {
    const map = kakaoMapRef.current;
    if (!map || !window.kakao?.maps) return;

    setIsSplitRoadview(true);
    map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);

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
      setTimeout(() => { map.relayout(); }, 150);
    }
    if (roadviewMarkerRef.current) {
      roadviewMarkerRef.current.setMap(null);
      roadviewMarkerRef.current = null;
    }
    setIsSplitRoadview(false);
  };

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

    roadviewClient.getNearestPanoId(position, 100, (panoId: any) => {
      setRoadviewLoading(false);
      if (panoId) {
        if (!roadviewRef.current) {
          const rv = new window.kakao.maps.Roadview(roadviewContainerRef.current);
          roadviewRef.current = rv;

          window.kakao.maps.event.addListener(rv, 'viewpoint_changed', () => {
            const viewpoint = rv.getViewpoint();
            updateRoadviewMarkerAngle(viewpoint.pan);
          });

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
        setRoadviewError('반경 100m 내에 촬영된 로드뷰 도로가 없습니다. 지도의 파란색 도로 위를 탭해 주세요.');
      }
    });
  };

  const moveToRoadview = (lat: number, lng: number) => {
    initOrMoveRoadview(lat, lng);
    // 지도 탭 시 해당 위치의 건물 정보도 함께 갱신하여 확인 가능하도록 연동
    handleLocationSelect(lat, lng, false);
  };

  const updateRoadviewMarkerPosition = (latlng: any) => {
    const map = kakaoMapRef.current;
    if (!map || !window.kakao?.maps) return;

    if (!roadviewMarkerRef.current) {
      const markerContent = document.createElement('div');
      markerContent.id = 'roadview-walker-marker';
      markerContent.style.cssText = `
        width: 32px; height: 32px;
        background: rgba(255, 42, 42, 0.95);
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

  // 모달 열 때 폼 상태 채우기
  const openEditModal = () => {
    if (!selectedLocation) return;
    setFormName(selectedLocation.name || '');
    setFormRoadAddress(selectedLocation.road_address || selectedLocation.address || '');
    setFormJibunAddress(selectedLocation.jibun_address || '');
    setFormGrndFlr(selectedLocation.floors || '');
    setFormUgrndFlr(selectedLocation.ugrnd_flr || '');
    setFormTotar(selectedLocation.totar || '');
    setFormUseaprDay(selectedLocation.useapr_day || '');
    setFormStructure(selectedLocation.structure || '');
    setFormPurpose(selectedLocation.purpose || '');
    setFormFieldNote(selectedLocation.field_note || '');
    setPhoto1(null); setPhoto2(null); setPhoto3(null);
    setShowEditModal(true);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>

      {/* ── [분할 모드 상단] 360° 로드뷰 창 (클릭했을 때만 노출!) ── */}
      {isSplitRoadview && (
        <div style={{
          width: '100%',
          height: '42%',
          position: 'relative',
          backgroundColor: '#000',
          borderBottom: '2px solid var(--brand-red)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          zIndex: 100
        }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: '11px', backgroundColor: 'var(--brand-red)', color: 'white', padding: '2px 8px', borderRadius: '100px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                360° 로드뷰
              </span>
              {selectedLocation ? (
                <span style={{ fontSize: '12px', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  🏢 {selectedLocation.name}
                </span>
              ) : (
                <span style={{ fontSize: '12px', color: 'white', fontWeight: 600 }}>
                  도로를 탭하면 로드뷰가 이동합니다
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {selectedLocation && (
                <button
                  onClick={() => setShowDetailSheet(true)}
                  style={{
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    color: 'white',
                    borderRadius: '100px',
                    padding: '5px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                  title="건물 상세 제원 및 송수관 사진 보기"
                >
                  <FileText size={13} color="#6ea8fe" />
                  <span>건물 정보/사진</span>
                </button>
              )}
              <button
                onClick={closeSplitRoadview}
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  borderRadius: '100px',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600
                }}
                title="로드뷰 닫고 전체 지도로 복귀"
              >
                <X size={14} />
                <span>닫기</span>
              </button>
            </div>
          </div>

          <div ref={roadviewContainerRef} style={{ width: '100%', height: '100%' }} />

          {roadviewLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10 }}>
              <Loader2 size={30} color="var(--brand-red)" className="animate-spin" style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
              <span style={{ color: 'white', fontSize: '12px', fontWeight: 600 }}>현장 로드뷰 로딩 중...</span>
            </div>
          )}

          {roadviewError && (
            <div style={{ position: 'absolute', bottom: '10px', left: '16px', right: '16px', backgroundColor: 'rgba(255,42,42,0.9)', color: 'white', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{roadviewError}</span>
              <button onClick={() => setRoadviewError(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* ── [지도 컨테이너] (지도가 화면의 80% 이상 확보됨!) ── */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: isSplitRoadview ? '58%' : '100%' }}>
        <div
          ref={mapContainerRef}
          style={{ width: '100%', height: '100%', backgroundColor: '#1a1d24' }}
        />

        {/* ── [로드뷰 분할 모드] 하단 간이 건물 정보 퀵 바 (탭하면 상세 정보/사진 즉시 확인) ── */}
        {isSplitRoadview && selectedLocation && (
          <div
            className="glass-panel btn-hover-effect"
            onClick={() => setShowDetailSheet(true)}
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              padding: '8px 16px',
              borderRadius: '100px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.25)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              backgroundColor: 'rgba(20, 24, 33, 0.94)',
              maxWidth: '92%'
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              🏢 {selectedLocation.name}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              color: selectedLocation.has_photos ? '#00e676' : '#ff5252',
              whiteSpace: 'nowrap'
            }}>
              {selectedLocation.has_photos ? '✓ 등록완료' : '! 미등록'}
            </span>
            <span style={{ fontSize: '11px', color: '#6ea8fe', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
              건물 정보/사진 <ChevronRight size={13} />
            </span>
          </div>
        )}

        {/* ── 지도 우측 플로팅 컨트롤 ── */}
        <div style={{ position: 'absolute', bottom: selectedLocation ? (isSplitRoadview ? '70px' : '160px') : '30px', right: '14px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', transition: 'bottom 0.3s ease' }}>
          
          {/* 스카이뷰(위성사진) 토글 */}
          <button
            className="glass btn-hover-effect"
            onClick={toggleMapType}
            style={{
              width: '42px', height: '42px', borderRadius: '12px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              border: isSkyview ? '2px solid var(--brand-red)' : '1px solid var(--border)',
              backgroundColor: isSkyview ? 'rgba(255,42,42,0.2)' : 'var(--surface)',
              cursor: 'pointer', padding: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            title={isSkyview ? "일반지도" : "위성지도"}
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
            >+</button>
            <button
              onClick={() => handleZoom(1)}
              style={{ width: '42px', height: '36px', background: 'var(--surface)', border: 'none', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >-</button>
          </div>

          {/* 현위치 (GPS) */}
          <button
            className="glass btn-hover-effect"
            onClick={handleLocateMe}
            style={{
              width: '42px', height: '42px', borderRadius: '12px',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              border: '1px solid var(--border)', cursor: 'pointer',
              backgroundColor: 'var(--surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            title="내 위치"
          >
            <LocateFixed size={20} color={locating ? "var(--brand-red)" : "var(--text-primary)"} className={locating ? "animate-pulse" : ""} />
          </button>
        </div>

        {/* ── Top Bar ── */}
        {!isSplitRoadview && (
          <div
            className="glass"
            style={{
              position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 1000, padding: '8px 18px', borderRadius: '20px',
              display: 'flex', alignItems: 'center', gap: '12px',
              width: '94%', maxWidth: '500px', border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <div style={{ width: '36px', height: '36px', backgroundColor: 'var(--brand-red)', borderRadius: '10px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'white' }}>
                파이어링크 <span style={{ color: 'var(--brand-red)', fontSize: '11px', fontWeight: 700 }}>SEOUL</span>
              </h1>
              <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>건물 연결송수관 설비 정보 시스템</p>
            </div>
            <button
              onClick={() => setShowMenu(true)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', padding: '6px', borderRadius: '10px' }}
            >
              <Menu size={18} />
            </button>
          </div>
        )}

        {/* ── Search Bar (검색 시 지도만 깔끔하게 이동, 로드뷰 강제 오픈 없음!) ── */}
        {!isSplitRoadview && (
          <div style={{
            position: 'absolute', top: '76px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, width: '92%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '6px'
          }}>
            <form
              onSubmit={handleSearch}
              className="glass"
              style={{
                display: 'flex', alignItems: 'center', padding: '3px 14px',
                borderRadius: '100px', border: '1px solid var(--border)'
              }}
            >
              <Search size={16} color="var(--text-secondary)" />
              <input
                type="text"
                placeholder="건물명 또는 주소 검색 (예: 종로구청, 세종대로 110)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  color: 'var(--text-primary)', padding: '10px 10px',
                  outline: 'none', fontSize: '13px'
                }}
              />
              {isSearching && <Loader2 size={16} className="animate-spin" color="var(--brand-red)" style={{ animation: 'spin 1s linear infinite' }} />}
            </form>

            {(searchResults.length > 0 || (isSearchFocused && searchHistory.length > 0 && searchQuery === '')) && (
              <div className="glass-panel" style={{ borderRadius: '14px', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto' }}>
                {(searchResults.length > 0 ? searchResults : searchHistory).map((result, idx) => {
                  const displayName = String(
                    result.place_name ||
                    result.name ||
                    result.title ||
                    result.address_name ||
                    (typeof result.address === 'string' ? result.address : '') ||
                    '검색 결과'
                  );
                  const displayAddress = typeof result.address === 'string'
                    ? result.address
                    : (result.road_address_name || result.address_name || result.address?.road || result.address?.parcel || '');
                  const lat = parseFloat(result.y || result.point?.y || '0');
                  const lng = parseFloat(result.x || result.point?.x || '0');

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                          addToHistory({
                            name: displayName,
                            address: displayAddress,
                            x: String(lng),
                            y: String(lat)
                          });
                          setSearchResults([]);
                          setSearchQuery('');
                          // 지도가 해당 좌표로 부드럽게 이동하고 하단 미니 카드만 활성화!
                          handleLocationSelect(lat, lng, true);
                        }
                      }}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px'
                      }}
                      className="btn-hover-effect"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPinned size={14} color="var(--brand-red)" />
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>
                          {displayName}
                        </span>
                      </div>
                      {displayAddress ? (
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {String(displayAddress)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* 🚒 [소방관용 슬림 미니 플로팅 카드] (화면의 20%만 차지, 지도가 80% 확보!) */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {selectedLocation && !isSplitRoadview && (
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '94%',
              maxWidth: '500px',
              zIndex: 1200,
              borderRadius: '20px',
              padding: '16px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {/* 1열: 건물명 + 닫기 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, marginRight: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building size={18} color="var(--brand-red)" />
                  <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'white' }}>
                    {selectedLocation.name}
                  </h2>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedLocation.road_address ? `도로명: ${selectedLocation.road_address}` : selectedLocation.address}
                </p>
              </div>
              <button
                onClick={() => { setSelectedLocation(null); if (currentMarkerRef.current) currentMarkerRef.current.setMap(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 2열: 송수관 등록 상태 한눈에 1초 파악! */}
            <div style={{
              backgroundColor: selectedLocation.has_photos ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 42, 42, 0.12)',
              border: `1px solid ${selectedLocation.has_photos ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 42, 42, 0.3)'}`,
              borderRadius: '10px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: selectedLocation.has_photos ? '#00e676' : 'var(--brand-red)'
                }} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: selectedLocation.has_photos ? '#00e676' : '#ff5252' }}>
                  {selectedLocation.has_photos ? '송수관 등록 완료' : '송수관 미등록'}
                </span>
                {selectedLocation.field_note && (
                  <span style={{ fontSize: '12px', color: 'white', fontWeight: 500 }}>
                    · {selectedLocation.field_note.slice(0, 16)}...
                  </span>
                )}
              </div>
              {selectedLocation.has_photos && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  사진 { [selectedLocation.photo1_path, selectedLocation.photo2_path, selectedLocation.photo3_path].filter(Boolean).length }장
                </span>
              )}
            </div>

            {/* 3열: 소방관 핵심 조작 버튼 (로드뷰 / 상세보기 / 정보등록) */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* 로드뷰 열기: 클릭했을 때만 실행! */}
              <button
                className="btn-secondary btn-hover-effect"
                onClick={() => openSplitRoadview(selectedLocation.lat, selectedLocation.lng)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: '10px',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px',
                  fontSize: '12px', fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.06)'
                }}
              >
                <Compass size={15} color="var(--brand-red)" />
                <span>360° 로드뷰</span>
              </button>

              {/* 사진 및 상세 펼치기 */}
              {selectedLocation.has_photos && (
                <button
                  className="btn-secondary btn-hover-effect"
                  onClick={() => setShowDetailSheet(true)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: '10px',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px',
                    fontSize: '12px', fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.06)'
                  }}
                >
                  <ImageIcon size={15} color="#6ea8fe" />
                  <span>사진 보기</span>
                </button>
              )}

              {/* 정보 및 사진 직접 등록/제보 */}
              <button
                className="btn-primary"
                onClick={openEditModal}
                style={{
                  flex: 1.2, padding: '10px 8px', borderRadius: '10px',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px',
                  fontSize: '12px', fontWeight: 800
                }}
              >
                <Edit3 size={15} />
                <span>{selectedLocation.has_photos ? '정보/사진 수정' : '송수관 정보 제보'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── [상세 사진 및 건축 정보 펼침 시트] (사진 보기 클릭 시에만 노출) ── */}
        {showDetailSheet && selectedLocation && (
          <div
            className="glass-panel"
            style={{
              position: 'fixed', inset: 0, zIndex: 3000,
              backgroundColor: 'rgba(10, 11, 14, 0.95)',
              display: 'flex', flexDirection: 'column'
            }}
          >
            {/* 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{selectedLocation.name} 송수관 사진</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedLocation.address}</p>
              </div>
              <button onClick={() => setShowDetailSheet(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {/* 스크롤 내용 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 대원이 직접 기재한 현장 특이사항 */}
              {selectedLocation.field_note && (
                <div style={{ backgroundColor: 'var(--surface)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--brand-red)', fontWeight: 800, marginBottom: '4px' }}>송수관 위치 특징 & 현장 특이사항</div>
                  <div style={{ fontSize: '14px', color: 'white', fontWeight: 600 }}>{selectedLocation.field_note}</div>
                </div>
              )}

              {/* 층수 / 연면적 / 준공일 등 직접 입력된 제원 */}
              {(selectedLocation.floors || selectedLocation.totar || selectedLocation.useapr_day) && (
                <div style={{ backgroundColor: 'var(--surface)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {selectedLocation.floors && (
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>층수: </span>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>지상 {selectedLocation.floors}층 · 지하 {selectedLocation.ugrnd_flr || '0'}층</span>
                    </div>
                  )}
                  {selectedLocation.totar && (
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>연면적: </span>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{selectedLocation.totar}</span>
                    </div>
                  )}
                  {selectedLocation.useapr_day && (
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>준공일: </span>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{selectedLocation.useapr_day}</span>
                    </div>
                  )}
                  {selectedLocation.structure && (
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>구조/용도: </span>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{selectedLocation.structure} / {selectedLocation.purpose}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 등록된 사진 1, 2, 3장 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            </div>
          </div>
        )}

      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ✏️ [건물 정보 및 송수관 직접 입력 / 제보 모달] */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {showEditModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)', zIndex: 4000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }}>
          <div style={{ flex: 1 }} onClick={() => !isUploading && setShowEditModal(false)}></div>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800 }}>소방관 제보 및 정보 직접 입력</h2>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  현장 확인 정보를 직접 입력하여 소방관들에게 공유합니다
                </p>
              </div>
              <button disabled={isUploading} onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* 건물 기본 정보 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>건물명</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="예: 서울특별시청"
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>도로명 주소</label>
                  <input
                    value={formRoadAddress}
                    onChange={e => setFormRoadAddress(e.target.value)}
                    placeholder="예: 세종대로 110"
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* 층수 세분화 (소방관 필수 정보) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>지상 층수</label>
                  <input
                    value={formGrndFlr}
                    onChange={e => setFormGrndFlr(e.target.value)}
                    placeholder="예: 15"
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#ff7043', display: 'block', marginBottom: '4px', fontWeight: 700 }}>지하 층수 (작전 핵심)</label>
                  <input
                    value={formUgrndFlr}
                    onChange={e => setFormUgrndFlr(e.target.value)}
                    placeholder="예: 3"
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid #ff7043', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* 연면적 & 준공일 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>연면적 (m² 또는 평)</label>
                  <input
                    value={formTotar}
                    onChange={e => setFormTotar(e.target.value)}
                    placeholder="예: 45,000㎡ 또는 13,000평"
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>준공년도 (사용승인)</label>
                  <input
                    value={formUseaprDay}
                    onChange={e => setFormUseaprDay(e.target.value)}
                    placeholder="예: 2012년 또는 1998년"
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* 송수관 퀵 태그 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--brand-red)', fontWeight: 700 }}>송수관 위치 퀵 태그 (터치하여 자동 입력)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {QUICK_TAGS.map((tag, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFormFieldNote(prev => prev ? `${prev}, ${tag}` : tag)}
                      style={{
                        padding: '4px 9px', borderRadius: '100px',
                        backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
                        color: 'white', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                      }}
                      className="btn-hover-effect"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* 현장 메모 */}
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>송수관 상세 위치 특징 & 현장 특이사항</label>
                <textarea
                  placeholder="예: 정문 우측 1m 화단 뒤쪽, 쌍구형(65mm), 가로수 가림으로 야간 식별 주의 등"
                  value={formFieldNote}
                  onChange={e => setFormFieldNote(e.target.value)}
                  style={{ width: '100%', height: '65px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', color: 'white', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', fontSize: '12px' }}
                />
              </div>

              {/* 사진 업로드 3종 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <label style={{ height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', border: '1px dashed var(--border)', borderRadius: '10px', backgroundColor: photo1 ? 'rgba(255,42,42,0.1)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto1(e.target.files?.[0] ?? null)} />
                  <Camera size={18} color={photo1 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '10px', color: photo1 ? 'var(--brand-red)' : 'var(--text-secondary)', fontWeight: 600 }}>{photo1 ? '전경 선택됨' : '1. 전경 사진'}</span>
                </label>
                <label style={{ height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', border: '1px dashed var(--border)', borderRadius: '10px', backgroundColor: photo2 ? 'rgba(255,42,42,0.1)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto2(e.target.files?.[0] ?? null)} />
                  <Camera size={18} color={photo2 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '10px', color: photo2 ? 'var(--brand-red)' : 'var(--text-secondary)', fontWeight: 600 }}>{photo2 ? '상세 선택됨' : '2. 상세 사진'}</span>
                </label>
                <label style={{ height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', border: '1px dashed var(--border)', borderRadius: '10px', backgroundColor: photo3 ? 'rgba(255,42,42,0.1)' : 'var(--surface)', cursor: 'pointer' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setPhoto3(e.target.files?.[0] ?? null)} />
                  <Camera size={18} color={photo3 ? 'var(--brand-red)' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '10px', color: photo3 ? 'var(--brand-red)' : 'var(--text-secondary)', fontWeight: 600 }}>{photo3 ? '방면 캡쳐됨' : '3. 지도 방면'}</span>
                </label>
              </div>

              {/* 저장 버튼 */}
              <button
                className="btn-primary"
                disabled={isUploading}
                style={{ height: '46px', fontSize: '15px', fontWeight: 800 }}
                onClick={async () => {
                  if (!selectedLocation) return;
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

                    const results = await Promise.all(uploadPromises);
                    for (const res of results) {
                      if (res.error) throw new Error('사진 파일 업로드 실패: ' + res.error.message);
                    }

                    const hasAnyPhoto = Boolean(path1 || path2 || path3 || selectedLocation.has_photos);

                    const saveData = {
                      id: selectedLocation.id,
                      name: formName || selectedLocation.name,
                      address: formRoadAddress || selectedLocation.address,
                      road_address: formRoadAddress,
                      jibun_address: formJibunAddress,
                      lat: selectedLocation.lat,
                      lng: selectedLocation.lng,
                      floors: formGrndFlr,
                      ugrnd_flr: formUgrndFlr,
                      totar: formTotar,
                      useapr_day: formUseaprDay,
                      structure: formStructure,
                      purpose: formPurpose,
                      has_photos: hasAnyPhoto,
                      field_note: formFieldNote,
                      registered_at: new Date().toISOString(),
                      visited_at: new Date().toISOString(),
                      user_edited_name: formName,
                      user_edited_address: formRoadAddress,
                      edited_by: deviceId.slice(0, 8),
                      edited_at: new Date().toISOString(),
                      device_id: deviceId,
                      ...(path1 ? { photo1_path: path1 } : {}),
                      ...(path2 ? { photo2_path: path2 } : {}),
                      ...(path3 ? { photo3_path: path3 } : {})
                    };

                    const { error: dbError } = await supabase.from('buildings').upsert(saveData);
                    if (dbError) throw new Error('DB 저장 실패: ' + dbError.message);

                    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
                    const ts = Date.now();
                    setSelectedLocation((prev: any) => ({
                      ...prev,
                      name: formName || prev.name,
                      address: formRoadAddress || prev.address,
                      road_address: formRoadAddress,
                      jibun_address: formJibunAddress,
                      floors: formGrndFlr,
                      ugrnd_flr: formUgrndFlr,
                      totar: formTotar,
                      useapr_day: formUseaprDay,
                      has_photos: hasAnyPhoto,
                      field_note: formFieldNote,
                      photo1_path: path1,
                      photo2_path: path2,
                      photo3_path: path3,
                      photo1_url: path1 ? `${baseUrl}/storage/v1/object/public/building-photos/${path1}?t=${ts}` : prev.photo1_url,
                      photo2_url: path2 ? `${baseUrl}/storage/v1/object/public/building-photos/${path2}?t=${ts}` : prev.photo2_url,
                      photo3_url: path3 ? `${baseUrl}/storage/v1/object/public/building-photos/${path3}?t=${ts}` : prev.photo3_url,
                    }));

                    setShowEditModal(false);
                    await fetchRegistry();
                    alert('현장 정보 및 송수관 제보가 성공적으로 저장되었습니다! 🚒');
                  } catch (err: any) {
                    console.error('Save error:', err);
                    alert('저장 실패: ' + (err.message || '알 수 없는 오류'));
                  } finally {
                    setIsUploading(false);
                  }
                }}
              >
                {isUploading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>저장 중...</span>
                  </div>
                ) : (
                  <span>현장 정보 저장 및 제보 완료</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Side Menu Drawer ── */}
      {showMenu && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end'
        }}>
          <div style={{ flex: 1 }} onClick={() => setShowMenu(false)}></div>
          <div className="glass-panel" style={{ width: '280px', height: '100%', borderTop: 'none', borderLeft: '1px solid var(--border)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>메뉴</h2>
              <button onClick={() => setShowMenu(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowUnregistered(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', border: 'none', padding: '12px 10px' }}>
                <AlertCircle size={18} color="var(--brand-red)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>미등록 건물 현황</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>송수관 미등록 건물 목록</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowStats(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', border: 'none', padding: '12px 10px' }}>
                <History size={18} color="var(--brand-red)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>내 기여 현황</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>등록 완료 건물 및 제보 통계</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowGuide(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', border: 'none', padding: '12px 10px' }}>
                <Camera size={18} color="var(--brand-red)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>송수관 촬영 가이드</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>올바른 촬영 기준 및 각도</div>
                </div>
              </button>
              <button className="btn-secondary" onClick={() => { setShowMenu(false); setShowStation(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', border: 'none', padding: '12px 10px' }}>
                <Info size={18} color="var(--brand-red)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>관할 소방서 연락처</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>서울시 25개 소방서 비상전화</div>
                </div>
              </button>
            </div>

            <div style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>
              Fire-Link: Seoul v1.4 (Tactical Field Edition)
            </div>
          </div>
        </div>
      )}

      {/* ── 미등록 건물 현황 모달 ── */}
      {showUnregistered && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>미등록 건물 현황</h2>
              <button onClick={() => setShowUnregistered(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            {registry.filter(r => !r.has_photos).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                <AlertCircle size={36} style={{ marginBottom: '8px', opacity: 0.4 }} />
                <p style={{ fontSize: '13px' }}>미등록 건물이 없습니다.</p>
              </div>
            ) : (
              registry.filter(r => !r.has_photos).map((b, i) => (
                <div key={i} onClick={() => { setShowUnregistered(false); handleLocationSelect(b.lat, b.lng, true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: 'var(--surface)', borderRadius: '10px', marginBottom: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{b.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{b.address}</div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--brand-red)', fontWeight: 700 }}>미등록</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── 내 기여 현황 모달 ── */}
      {showStats && (() => {
        const registered = registry.filter(r => r.has_photos);
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>내 기여 현황</h2>
                <button onClick={() => setShowStats(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={22} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '16px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#00e676' }}>{registered.length}개</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>등록 완료 건물</div>
                </div>
                <div style={{ backgroundColor: 'var(--surface)', borderRadius: '12px', padding: '16px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--brand-red)' }}>{registry.length}개</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>전체 관리 건물</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 송수관 촬영 가이드 ── */}
      {showGuide && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>송수관 촬영 가이드</h2>
              <button onClick={() => setShowGuide(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            {[
              { step: '01', title: '전경 사진 (원거리)', desc: '건물 정면 5~10m 거리. 건물 입구와 송수관 위치가 함께 보이도록 촬영.' },
              { step: '02', title: '상세 사진 (근거리)', desc: '송수관 1m 이내 접근. 연결구 구경, 잠금장치, 표지판이 선명해야 함.' },
              { step: '03', title: '지도 방면 캡쳐', desc: '지도를 캡쳐하여 송수관이 건물의 어느 방면(동/서/남/북)에 있는지 표시.' },
            ].map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--brand-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', fontWeight: 800 }}>{g.step}</div>
                <div style={{ backgroundColor: 'var(--surface)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border)', flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{g.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 관할 소방서 정보 ── */}
      {showStation && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div className="glass-panel" style={{ padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>관할 소방서 연락처</h2>
              <button onClick={() => setShowStation(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            {[
              { name: '종로소방서', tel: '02-737-0119' },
              { name: '중부소방서', tel: '02-3705-0119' },
              { name: '마포소방서', tel: '02-320-9119' },
              { name: '영등포소방서', tel: '02-2637-0119' },
              { name: '구로소방서', tel: '02-2618-0119' },
              { name: '강남소방서', tel: '02-554-0119' }
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: 'var(--surface)', borderRadius: '10px', marginBottom: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>{s.name}</span>
                <a href={`tel:${s.tel}`} style={{ backgroundColor: 'var(--brand-red)', color: 'white', padding: '4px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>{s.tel}</a>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
