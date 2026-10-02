import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ theme: string; z: string; x: string; y: string }> }
) {
  const { theme, z, x, y } = await params;
  const cleanY = y.replace(/\.png$/, "");
  const tomtomKey = "FtEclPAu7Ksrt5sy6f5XvnHr4JmDZ8uB";

  const style = theme === "light" ? "main" : "night";
  const url = `https://api.tomtom.com/map/1/tile/basic/${style}/${z}/${x}/${cleanY}.png?key=${tomtomKey}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "EMEFast/3.0" },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const blob = await res.arrayBuffer();
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e: any) {
    return new NextResponse(null, { status: 502 });
  }
}
