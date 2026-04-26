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

  // V-World Data API URL for fetching building information by point intersection
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=lt_c_bldginfo&key=${key}&domain=http://localhost:3000&geomFilter=point(${lng} ${lat})&crs=EPSG:4326&format=json`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('V-World API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch from V-World' }, { status: 500 });
  }
}
