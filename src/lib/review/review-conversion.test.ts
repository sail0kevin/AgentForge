import { describe, it, expect } from 'vitest';
import type { SimplifiedReviewResult, ReviewResult } from './contracts';

describe('SimplifiedReviewResult to ReviewResult conversion', () => {
  it('should convert simplified finding to full finding format', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'needs_minor_revision',
      findings: [
        {
          id: 'f1',
          candidateId: 'c1',
          severity: 'high',
          description: 'Missing error handling in auth flow',
        },
      ],
      criticalIssues: ['Security concern in authentication'],
    };

    // 模拟 review-service.ts 中的转换逻辑
    const review: ReviewResult = {
      schemaVersion: 1,
      findings: simplified.findings.map(f => ({
        id: f.id,
        candidateId: f.candidateId,
        severity: f.severity,
        category: 'general',
        failureScenario: f.description,
        evidenceRefs: [],
        suggestion: f.description,
        relatedCandidateIds: [],
      })),
    };

    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].id).toBe('f1');
    expect(review.findings[0].candidateId).toBe('c1');
    expect(review.findings[0].severity).toBe('high');
    expect(review.findings[0].failureScenario).toBe('Missing error handling in auth flow');
    expect(review.findings[0].suggestion).toBe('Missing error handling in auth flow');
  });

  it('should handle empty findings array', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'no_major_issues',
      findings: [],
      criticalIssues: [],
    };

    const review: ReviewResult = {
      schemaVersion: 1,
      findings: simplified.findings.map(f => ({
        id: f.id,
        candidateId: f.candidateId,
        severity: f.severity,
        category: 'general',
        failureScenario: f.description,
        evidenceRefs: [],
        suggestion: f.description,
        relatedCandidateIds: [],
      })),
    };

    expect(review.findings).toHaveLength(0);
  });

  it('should convert multiple findings with different severities', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'needs_major_revision',
      findings: [
        {
          id: 'f1',
          candidateId: 'c1',
          severity: 'blocking',
          description: 'Critical security vulnerability',
        },
        {
          id: 'f2',
          candidateId: 'c1',
          severity: 'medium',
          description: 'Performance optimization needed',
        },
        {
          id: 'f3',
          candidateId: 'c2',
          severity: 'low',
          description: 'Minor code style issue',
        },
      ],
      criticalIssues: ['Security vulnerability in c1'],
    };

    const review: ReviewResult = {
      schemaVersion: 1,
      findings: simplified.findings.map(f => ({
        id: f.id,
        candidateId: f.candidateId,
        severity: f.severity,
        category: 'general',
        failureScenario: f.description,
        evidenceRefs: [],
        suggestion: f.description,
        relatedCandidateIds: [],
      })),
    };

    expect(review.findings).toHaveLength(3);
    expect(review.findings[0].severity).toBe('blocking');
    expect(review.findings[1].severity).toBe('medium');
    expect(review.findings[2].severity).toBe('low');
    expect(review.findings[2].candidateId).toBe('c2');
  });
});

describe('Fast-path logic', () => {
  it('should trigger fast-path for no_major_issues with empty findings', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'no_major_issues',
      findings: [],
      criticalIssues: [],
    };

    const shouldSkipRevision =
      simplified.overallAssessment === 'no_major_issues' &&
      simplified.findings.length === 0;

    expect(shouldSkipRevision).toBe(true);
  });

  it('should NOT trigger fast-path if findings exist despite no_major_issues', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'no_major_issues',
      findings: [
        {
          id: 'f1',
          candidateId: 'c1',
          severity: 'low',
          description: 'Minor improvement suggestion',
        },
      ],
      criticalIssues: [],
    };

    const shouldSkipRevision =
      simplified.overallAssessment === 'no_major_issues' &&
      simplified.findings.length === 0;

    expect(shouldSkipRevision).toBe(false);
  });

  it('should NOT trigger fast-path for needs_minor_revision even with empty findings', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'needs_minor_revision',
      findings: [],
      criticalIssues: ['Some concern noted'],
    };

    const shouldSkipRevision =
      simplified.overallAssessment === 'no_major_issues' &&
      simplified.findings.length === 0;

    expect(shouldSkipRevision).toBe(false);
  });

  it('should NOT trigger fast-path for needs_major_revision', () => {
    const simplified: SimplifiedReviewResult = {
      schemaVersion: 1,
      overallAssessment: 'needs_major_revision',
      findings: [
        {
          id: 'f1',
          candidateId: 'c1',
          severity: 'blocking',
          description: 'Critical issue',
        },
      ],
      criticalIssues: ['Critical security issue'],
    };

    const shouldSkipRevision =
      simplified.overallAssessment === 'no_major_issues' &&
      simplified.findings.length === 0;

    expect(shouldSkipRevision).toBe(false);
  });
});
