import { useEffect, useRef, useState } from 'react';
import type { Landmark } from '../shared/landmarks';
import { loadMarsImages } from '../three/assets';

/** Width of the crop in degrees of longitude at the equator. */
const SPAN_DEG = 26;
export const THUMB_CREDIT =
  'Global colour mosaic: Solar System Scope (CC BY 4.0), from NASA imagery. A regional crop centred on the reference coordinate, not a local image.';

/**
 * A crop of the globe's colour mosaic around the landmark's reference coordinate, with a
 * small cross at the centre. The reference supplies no credited photographs, so this real,
 * credited regional view is used instead of an invented image.
 */
export default function LandmarkThumb({ landmark }: { landmark: Landmark }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMarsImages()
      .then(({ color }) => {
        const c = canvas.current;
        if (cancelled || !c) return;
        const g = c.getContext('2d');
        if (!g) return;
        const W = color.naturalWidth;
        const H = color.naturalHeight;
        const pxPerDeg = W / 360;
        const lon = landmark.longitudeEast360 > 180 ? landmark.longitudeEast360 - 360 : landmark.longitudeEast360;
        // Wider in longitude towards the poles, so the crop covers similar ground
        const spanLon = Math.min(120, SPAN_DEG / Math.max(0.25, Math.cos((landmark.latitude * Math.PI) / 180)));
        const spanLat = (SPAN_DEG * c.height) / c.width;
        const cx = ((lon + 180) / 360) * W;
        const cy = ((90 - landmark.latitude) / 180) * H;
        const sw = spanLon * pxPerDeg;
        const sh = spanLat * pxPerDeg;
        const sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
        g.clearRect(0, 0, c.width, c.height);
        // Draw in up to two pieces, so crops across 180° wrap around
        let sx = cx - sw / 2;
        sx = ((sx % W) + W) % W;
        const first = Math.min(sw, W - sx);
        g.drawImage(color, sx, sy, first, sh, 0, 0, (first / sw) * c.width, c.height);
        if (first < sw) g.drawImage(color, 0, sy, sw - first, sh, (first / sw) * c.width, 0, ((sw - first) / sw) * c.width, c.height);
        // Centre mark at the reference coordinate (shifted when the crop meets a pole)
        const my = ((cy - sy) / sh) * c.height;
        g.strokeStyle = 'rgba(243, 229, 220, 0.9)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(c.width / 2 - 9, my);
        g.lineTo(c.width / 2 - 3, my);
        g.moveTo(c.width / 2 + 3, my);
        g.lineTo(c.width / 2 + 9, my);
        g.moveTo(c.width / 2, my - 9);
        g.lineTo(c.width / 2, my - 3);
        g.moveTo(c.width / 2, my + 3);
        g.lineTo(c.width / 2, my + 9);
        g.stroke();
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [landmark]);

  return (
    <figure className="ex-thumb">
      {failed ? (
        <div className="ex-thumb__missing">Imagery unavailable</div>
      ) : (
        <canvas ref={canvas} width={480} height={270} role="img" aria-label={`Regional view around ${landmark.name}`} />
      )}
      <figcaption>{THUMB_CREDIT}</figcaption>
    </figure>
  );
}
