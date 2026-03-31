import { describe, it, expect } from 'vitest';
import { CreateTaskSchema } from '@hive/shared';

/**
 * B2: API contract tests — verify camelCase is enforced, snake_case is rejected/stripped.
 */
describe('API contract — camelCase enforcement', () => {
  const validBase = {
    title: 'Test Task',
    description: 'A test',
    requiredCapabilities: ['coding'],
    createdBy: 'test-agent',
  };

  it('CreateTaskSchema accepts camelCase orchestration fields', () => {
    const result = CreateTaskSchema.safeParse({
      ...validBase,
      taskKind: 'execute',
      verificationRequired: true,
      parentTaskId: 'parent-1',
      runId: 'run-abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.taskKind).toBe('execute');
      expect(result.data.verificationRequired).toBe(true);
      expect(result.data.parentTaskId).toBe('parent-1');
      expect(result.data.runId).toBe('run-abc');
    }
  });

  it('CreateTaskSchema strips snake_case fields (Zod ignores unknown keys)', () => {
    const result = CreateTaskSchema.safeParse({
      ...validBase,
      task_kind: 'execute',
      verification_required: true,
      parent_task_id: 'parent-1',
      run_id: 'run-abc',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // snake_case fields should NOT appear in parsed output
      expect(result.data).not.toHaveProperty('task_kind');
      expect(result.data).not.toHaveProperty('verification_required');
      expect(result.data).not.toHaveProperty('parent_task_id');
      expect(result.data).not.toHaveProperty('run_id');
      // camelCase versions should be undefined (not provided)
      expect(result.data.taskKind).toBeUndefined();
      expect(result.data.verificationRequired).toBeUndefined();
    }
  });

  it('CreateTaskSchema accepts collaboration metadata in camelCase', () => {
    const result = CreateTaskSchema.safeParse({
      ...validBase,
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      contextRef: 'ref-123',
      artifacts: ['file1.ts'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fromAgentId).toBe('agent-a');
      expect(result.data.toAgentId).toBe('agent-b');
      expect(result.data.contextRef).toBe('ref-123');
    }
  });
});
