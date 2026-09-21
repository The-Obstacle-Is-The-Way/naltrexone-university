import { describe, expect, it } from 'vitest';
import {
  type ArchitectureSourceFile,
  collectArchitectureBoundaryIssues,
  collectPresentationHookNamingIssues,
  collectQuestionRouteHookOrganizationIssues,
  readProductionArchitectureSources,
  readRepositoryTypescriptFilePaths,
} from './architecture-boundary-source-scan';

function source(filePath: string, contents: string): ArchitectureSourceFile {
  return { filePath, contents: contents.trimStart() };
}

describe('Clean Architecture import boundaries', () => {
  it.each([
    [
      'src/domain/entities/example.ts',
      'export const load = () => import(`zod`);',
    ],
    [
      'src/domain/entities/example.ts',
      "export const load = () => require('zod');",
    ],
    [
      'src/application/use-cases/example.ts',
      'export const load = () => import(`stripe`);',
    ],
    [
      'src/application/use-cases/example.ts',
      "export const load = () => require('stripe');",
    ],
  ])('rejects the documented Biome gap at %s: %s', (filePath, contents) => {
    expect(
      collectArchitectureBoundaryIssues([source(filePath, contents)]),
    ).toHaveLength(1);
  });

  it.each([
    [
      'src/domain/entities/example.ts',
      "export { helper } from '../../application/helper';",
    ],
    [
      'src/application/use-cases/example.ts',
      "export { helper } from '../../adapters/helper';",
    ],
    [
      'src/adapters/controllers/example.ts',
      "export { helper } from '../../../app/helper';",
    ],
  ])('rejects a resolved relative escape at %s', (filePath, contents) => {
    expect(
      collectArchitectureBoundaryIssues([source(filePath, contents)]),
    ).toHaveLength(1);
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

  it('blocks outer layers from exact and nested bypass roots without prefix overreach', () => {
    const issues = collectArchitectureBoundaryIssues([
      source(
        'components/example.tsx',
        `
          import { SubmitAnswerUseCase } from '@/src/application/use-cases';
          import { UserRepository } from '@/src/application/ports/repositories';
          import { DrizzleUserRepository } from '@/src/adapters/repositories';
          import { SubmitAnswerUseCase as NestedUseCase } from '@/src/application/use-cases/submit-answer';
          import { DrizzleUserRepository as NestedRepository } from '@/src/adapters/repositories/drizzle-user-repository';
          import { report } from '@/src/application/ports/repositories-report';
        `,
      ),
    ]);

    expect(issues).toEqual([
      "components/example.tsx:1 outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '@/src/application/use-cases'.",
      "components/example.tsx:2 outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '@/src/application/ports/repositories'.",
      "components/example.tsx:3 outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '@/src/adapters/repositories'.",
      "components/example.tsx:4 outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '@/src/application/use-cases/submit-answer'.",
      "components/example.tsx:5 outer layers must use controller/composition entry points instead of runtime use-case/repository imports; found '@/src/adapters/repositories/drizzle-user-repository'.",
    ]);
  });

  it('keeps the live production source tree within enforced import boundaries', () => {
    expect(
      collectArchitectureBoundaryIssues(readProductionArchitectureSources()),
    ).toEqual([]);
  });
});

describe('presentation hook organization policy', () => {
  it('requires question-route hooks to live under the route hooks directory', () => {
    expect(
      collectQuestionRouteHookOrganizationIssues([
        'app/(app)/app/questions/[slug]/use-question-page-bookmarks.ts',
        'app/(app)/app/questions/[slug]/hooks/use-question-page-bookmarks.ts',
      ]),
    ).toEqual([
      'app/(app)/app/questions/[slug]/use-question-page-bookmarks.ts must live under app/(app)/app/questions/[slug]/hooks/.',
    ]);
  });

  it('reserves controller naming for adapter/controller modules', () => {
    expect(
      collectPresentationHookNamingIssues([
        'app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts',
        'app/(app)/app/questions/[slug]/hooks/use-question-page-controller.ts',
        'src/adapters/controllers/practice-controller.ts',
      ]),
    ).toEqual([
      'app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts is presentation state, not an adapter controller; expected use-practice-session-page-model.ts.',
      'app/(app)/app/questions/[slug]/hooks/use-question-page-controller.ts is presentation state, not an adapter controller; expected use-question-page-model.ts.',
    ]);
  });

  it('keeps live question-route hooks and presentation hook names aligned with the glossary', () => {
    const filePaths = readRepositoryTypescriptFilePaths();

    expect(collectQuestionRouteHookOrganizationIssues(filePaths)).toEqual([]);
    expect(collectPresentationHookNamingIssues(filePaths)).toEqual([]);
  });
});
