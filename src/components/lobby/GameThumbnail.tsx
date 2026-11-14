"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { GAME_THUMBNAIL_SIZES, isGameArtworkReady, subscribeGameArtwork } from "@/lib/gameArtwork";
import { GAME_THUMBNAILS } from "@/lib/gameCatalog";

export function GameThumbnail({ src, alt, className, loading }: {
  src: string;
  alt: string;
  className: string;
  loading?: "eager" | "lazy";
}) {
  const [result, setResult] = useState<{ src: string; failed: boolean } | null>(null);
  const warmed = useSyncExternalStore(subscribeGameArtwork, () => isGameArtworkReady(src), () => false);
  const cachedImage = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete) {
      const failed = image.naturalWidth === 0;
      setResult(previous => previous?.src === src && previous.failed === failed ? previous : { src, failed });
    }
  }, [src]);
  const pending = result?.src !== src && !warmed;
  const failed = result?.src === src && result.failed;
  const thumbnail = GAME_THUMBNAILS[src];

  return (
    <>
      {src.startsWith("/games/") ? <Image ref={cachedImage} src={thumbnail ?? src} unoptimized={Boolean(thumbnail)} alt={alt} loading={warmed ? "eager" : loading} width={1024} height={700}
        sizes={GAME_THUMBNAIL_SIZES} className={className}
        onLoad={() => setResult({ src, failed: false })}
        onError={() => setResult({ src, failed: true })} /> :
      <img ref={cachedImage} src={src} alt={alt} loading={loading} decoding="async" className={className}
        onLoad={() => setResult({ src, failed: false })}
        onError={() => setResult({ src, failed: true })} />}
      {(pending || failed) && (
        <span role="status" aria-label={`${alt}: ${failed ? "image unavailable" : "loading image"}`}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1b1038]/90 px-1 text-center text-[9px] text-[#d8c8ff] sm:text-xs">
          {pending && <span aria-hidden="true" className="flex gap-1 motion-safe:animate-pulse">
            <span className="h-1.5 w-4 rounded bg-[#8b5cf6]" />
            <span className="h-1.5 w-4 rounded bg-[#b8a7e6]" />
            <span className="h-1.5 w-4 rounded bg-[#8b5cf6]" />
          </span>}
          <span>{failed ? "Image unavailable" : "Loading image..."}</span>
        </span>
      )}
    </>
  );
}
