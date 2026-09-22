import { ImageResponse } from 'next/og';

export const alt =
  'Addiction Boards — Addiction Psychiatry and Addiction Medicine board preparation';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: 80,
        // Raster-renderer boundary: dark semantic tokens, Pattern Registry §19.
        background: 'hsl(0, 0%, 3.5%)',
        color: 'hsl(0, 0%, 93%)',
        fontFamily: 'geist',
      }}
    >
      <div style={{ fontSize: 76, letterSpacing: -3, marginBottom: 36 }}>
        Addiction Boards
      </div>
      <div style={{ fontSize: 32, lineHeight: 1.45 }}>
        Addiction Psychiatry and Addiction Medicine
      </div>
      <div style={{ fontSize: 32, lineHeight: 1.45 }}>
        Practice questions. Detailed explanations. Board preparation.
      </div>
      <div style={{ fontSize: 24, marginTop: 48 }}>addictionboards.com</div>
    </div>,
    size,
  );
}
