import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const key = process.env.VWORLD_API_KEY;

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json({ error: 'API Key is missing. Please add VWORLD_API_KEY to .env.local' }, { status: 500 });
  }

  // Get the host from the request headers to match V-World domain registration
  const host = request.headers.get('host') || 'firelinkseoul.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const domain = `${protocol}://${host}`;

  // V-World Data API URL for fetching building information by point intersection
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=lt_c_bldginfo&key=${key}&domain=${domain}&geomFilter=point(${lng} ${lat})&crs=EPSG:4326&format=json`;
  
  try {
    let res = await fetch(url);
    
    // Check if the response is actually JSON
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('V-World Non-JSON Response:', text);
      return NextResponse.json({ error: 'V-World returned non-JSON response', details: text.slice(0, 100) }, { status: 502 });
    }

    let data = await res.json();
    
    // Fallback: if no features found at the exact point, try a bounding box search (~15m radius)
    if (data.response?.status === 'OK' && (!data.response.result?.featureCollection?.features || data.response.result.featureCollection.features.length === 0)) {
      const offset = 0.00015; // ~15 meters
      const minX = parseFloat(lng as string) - offset;
      const minY = parseFloat(lat as string) - offset;
      const maxX = parseFloat(lng as string) + offset;
      const maxY = parseFloat(lat as string) + offset;
      const boxUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=lt_c_bldginfo&key=${key}&domain=${domain}&geomFilter=BOX(${minX},${minY},${maxX},${maxY})&crs=EPSG:4326&format=json`;
      
      const boxRes = await fetch(boxUrl);
      const boxContentType = boxRes.headers.get('content-type');
      if (boxContentType && boxContentType.includes('application/json')) {
        const boxData = await boxRes.json();
        if (boxData.response?.status === 'OK' && boxData.response.result?.featureCollection?.features?.length > 0) {
          data = boxData;
        }
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('V-World API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch from V-World', details: error.message }, { status: 500 });
  }
}
