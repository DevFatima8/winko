import { NextResponse } from "next/server";
import { getServerSessionUser } from "@/lib/serverAuth";
import { cloudinaryConfig, uploadImageToCloudinary } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const me = await getServerSessionUser();
    if (!me || me.role !== "admin" || me.level < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!cloudinaryConfig()) {
      return NextResponse.json({ error: "Cloudinary set nahi hai. .env mein CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET add karein." }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const image = String(body.image ?? "");
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(image) || image.length > 900_000) {
      return NextResponse.json({ error: "QR image invalid ya bohat bari hai." }, { status: 400 });
    }
    const url = await uploadImageToCloudinary(image);
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[admin-upload-qr]", error);
    return NextResponse.json({ error: "QR image upload nahi ho saki. Dobara koshish karein." }, { status: 502 });
  }
}
