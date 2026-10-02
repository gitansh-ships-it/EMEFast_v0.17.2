import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;
  const cleanY = y.replace(/\.png$/, "");
  const tomtomKey = "FtEclPAu7Ksrt5sy6f5XvnHr4JmDZ8uB";

  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${cleanY}.png?key=${tomtomKey}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "EMEFast/3.0",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const blob = await res.arrayBuffer();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (e: any) {
    return new NextResponse(null, { status: 502 });
  }
}
