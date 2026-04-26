import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const key = process.env.VWORLD_API_KEY;

  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  if (!key) return NextResponse.json({ error: 'API Key missing' }, { status: 500 });

  try {
    // Try address search first (Road address)
    const roadAddressUrl = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=10&page=1&query=${encodeURIComponent(query)}&type=address&category=road&format=json&errorformat=json&key=${key}`;
    let res = await fetch(roadAddressUrl);
    let data = await res.json();

    // If no results, try parcel address
    if (data.response?.status === 'NOT_FOUND' || data.response?.status === 'ERROR') {
      const parcelAddressUrl = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=10&page=1&query=${encodeURIComponent(query)}&type=address&category=parcel&format=json&errorformat=json&key=${key}`;
      res = await fetch(parcelAddressUrl);
      data = await res.json();
    }

    // If still no results, try place search (POI)
    if (data.response?.status === 'NOT_FOUND' || data.response?.status === 'ERROR') {
      const placeUrl = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=10&page=1&query=${encodeURIComponent(query)}&type=place&format=json&errorformat=json&key=${key}`;
      res = await fetch(placeUrl);
      data = await res.json();
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
