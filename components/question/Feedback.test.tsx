'use client';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Feedback } from './Feedback';

describe('Feedback', () => {
  it('renders correct feedback with explanation', () => {
    const html = renderToStaticMarkup(
      <Feedback isCorrect={true} explanationMd="Because..." />,
    );

    expect(html).toContain('Correct');
    expect(html).toContain('Because...');
  });
});
