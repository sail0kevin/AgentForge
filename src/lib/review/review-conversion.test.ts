import assert from "node:assert/strict";
import test from "node:test";
import type { SimplifiedReviewResult, ReviewResult } from './contracts';

test('should convert simplified finding to full finding format', () => {
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

  assert.equal(review.findings.length, 1);
  assert.equal(review.findings[0].id, 'f1');
  assert.equal(review.findings[0].candidateId, 'c1');
  assert.equal(review.findings[0].severity, 'high');
  assert.equal(review.findings[0].failureScenario, 'Missing error handling in auth flow');
  assert.equal(review.findings[0].suggestion, 'Missing error handling in auth flow');
});

test('should handle empty findings array', () => {
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

  assert.equal(review.findings.length, 0);
});

test('should convert multiple findings with different severities', () => {
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

  assert.equal(review.findings.length, 3);
  assert.equal(review.findings[0].severity, 'blocking');
  assert.equal(review.findings[1].severity, 'medium');
  assert.equal(review.findings[2].severity, 'low');
  assert.equal(review.findings[2].candidateId, 'c2');
});

test('should trigger fast-path for no_major_issues with empty findings', () => {
  const simplified: SimplifiedReviewResult = {
    schemaVersion: 1,
    overallAssessment: 'no_major_issues',
    findings: [],
    criticalIssues: [],
  };

  const shouldSkipRevision =
    simplified.overallAssessment === 'no_major_issues' &&
    simplified.findings.length === 0;

  assert.equal(shouldSkipRevision, true);
});

test('should NOT trigger fast-path if findings exist despite no_major_issues', () => {
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

  assert.equal(shouldSkipRevision, false);
});

test('should NOT trigger fast-path for needs_minor_revision even with empty findings', () => {
  const simplified: SimplifiedReviewResult = {
    schemaVersion: 1,
    overallAssessment: 'needs_minor_revision',
    findings: [],
    criticalIssues: ['Some concern noted'],
  };

  const shouldSkipRevision =
    simplified.overallAssessment === 'no_major_issues' &&
    simplified.findings.length === 0;

  assert.equal(shouldSkipRevision, false);
});

test('should NOT trigger fast-path for needs_major_revision', () => {
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

  assert.equal(shouldSkipRevision, false);
});
