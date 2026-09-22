import { beforeAll, describe, expect, it } from 'vitest';

let renderImage: typeof import('./opengraph-image').default;

beforeAll(async () => {
  renderImage = (await import('./opengraph-image')).default;
});

describe('public social image', () => {
  it('renders a real 1200 by 630 PNG', async () => {
    const response = renderImage();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const header = new DataView(bytes.buffer);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new TextDecoder().decode(bytes.slice(12, 16))).toBe('IHDR');
    expect(header.getUint32(16)).toBe(1200);
    expect(header.getUint32(20)).toBe(630);
  });
});
