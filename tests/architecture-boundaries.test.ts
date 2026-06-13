import { describe, expect, it } from 'vitest';
import {
  type ArchitectureSourceFile,
  collectArchitectureBoundaryIssues,
  readProductionArchitectureSources,
} from './architecture-boundary-source-scan';

function source(filePath: string, contents: string): ArchitectureSourceFile {
  return { filePath, contents: contents.trimStart() };
}

describe('Clean Architecture import boundaries', () => {
  it('blocks non-relative domain imports across static, re-export, side-effect, and dynamic import shapes', () => {
    const issues = collectArchitectureBoundaryIssues([
      source(
        'src/domain/entities/bad-entity.ts',
        `
          import { z } from 'zod';
          import 'server-only';
          export { helper } from '@/src/application/shared/helper';

          export async function loadFramework() {
            return import('next/cache');
          }
        `,
      ),
    ]);

    expect(issues).toEqual([
      "src/domain/entities/bad-entity.ts:1 domain production code must use only relative imports; found 'zod'.",
      "src/domain/entities/bad-entity.ts:2 domain production code must use only relative imports; found 'server-only'.",
      "src/domain/entities/bad-entity.ts:3 domain production code must use only relative imports; found '@/src/application/shared/helper'.",
      "src/domain/entities/bad-entity.ts:6 domain production code must use only relative imports; found 'next/cache'.",
    ]);
  });

  it('blocks application imports from adapters and framework packages', () => {
    const issues = collectArchitectureBoundaryIssues([
      source(
        'src/application/use-cases/bad-use-case.ts',
        `
          import type { User } from '@/src/domain/entities';
          import { getQuestion } from '@/src/adapters/controllers/question-controller';
          import React from 'react';
          import type Stripe from 'stripe';
          import 'server-only';
        `,
      ),
    ]);

    expect(issues).toEqual([
      "src/application/use-cases/bad-use-case.ts:2 application code must not import adapters/framework code; found '@/src/adapters/controllers/question-controller'.",
      "src/application/use-cases/bad-use-case.ts:3 application code must not import adapters/framework code; found 'react'.",
      "src/application/use-cases/bad-use-case.ts:4 application code must not import adapters/framework code; found 'stripe'.",
      "src/application/use-cases/bad-use-case.ts:5 application code must not import adapters/framework code; found 'server-only'.",
    ]);
  });

  it('blocks adapters from importing app or component code', () => {
    const issues = collectArchitectureBoundaryIssues([
      source(
        'src/adapters/controllers/bad-controller.ts',
        `
          import { MarketingHome } from '@/components/marketing/marketing-home';
          export { metadata } from '@/app/layout';
        `,
      ),
    ]);

    expect(issues).toEqual([
      "src/adapters/controllers/bad-controller.ts:1 adapters must not import app/components code; found '@/components/marketing/marketing-home'.",
      "src/adapters/controllers/bad-controller.ts:2 adapters must not import app/components code; found '@/app/layout'.",
    ]);
  });

  it('blocks outer layers from bypassing controller/composition entry points with runtime use-case imports', () => {
    const issues = collectArchitectureBoundaryIssues([
      source(
        'app/(app)/app/example/page.tsx',
        `
          import type { SubmitAnswerOutput } from '@/src/application/use-cases/submit-answer';
          import { submitAnswer } from '@/src/application/use-cases/submit-answer';
          import { getQuestionBySlug } from '@/src/adapters/controllers/question-view-controller';
        `,
      ),
    ]);

    expect(issues).toEqual([
      "app/(app)/app/example/page.tsx:2 outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '@/src/application/use-cases/submit-answer'.",
    ]);
  });

  it('keeps the live production source tree within enforced import boundaries', () => {
    expect(
      collectArchitectureBoundaryIssues(readProductionArchitectureSources()),
    ).toEqual([]);
  });
});
