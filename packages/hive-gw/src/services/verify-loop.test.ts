import { describe, it, expect, beforeEach } from 'vitest';
import { TaskMachine } from './task-machine.js';
import { EventBus } from './event-bus.js';
import { VerifyLoop } from './verify-loop.js';

describe('VerifyLoop — auto-create verify sub-tasks', () => {
  let tm: TaskMachine;
  let bus: EventBus;
  let loop: VerifyLoop;

  beforeEach(() => {
    tm = new TaskMachine();
    bus = new EventBus(100);
    loop = new VerifyLoop(tm, bus);
    loop.registerHooks();
  });

  it('creates verify sub-task when verificationRequired task completes', () => {
    const task = tm.create({
      title: 'Implement feature',
      description: 'Build auth module',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      taskKind: 'execute',
      runId: 'run-1',
      verificationRequired: true,
    });
    // Simulate full lifecycle: claim → working → done
    tm.claim(task.id, 'executor', 1);
    tm.transition(task.id, 'working', 'executor', 2);
    // This emit triggers the verify loop
    const done = tm.transition(task.id, 'done', 'executor', 3, { result: 'auth module complete' });
    bus.emit({ type: 'task.completed', data: { taskId: done.id, agentId: 'executor' } });

    // Should have created a verify sub-task
    const allTasks = tm.getAll();
    const verifyTask = allTasks.find(t => t.taskKind === 'verify' && t.parentTaskId === task.id);
    expect(verifyTask).toBeDefined();
    expect(verifyTask!.status).toBe('pending');
    expect(verifyTask!.runId).toBe('run-1');
    expect(verifyTask!.title).toContain('Verify');
    expect(verifyTask!.contextRef).toContain(task.id);
  });

  it('does NOT create verify task when verificationRequired is false/missing', () => {
    const task = tm.create({
      title: 'Simple task',
      description: '',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
    });
    tm.claim(task.id, 'executor', 1);
    tm.transition(task.id, 'working', 'executor', 2);
    const done = tm.transition(task.id, 'done', 'executor', 3, { result: 'done' });
    bus.emit({ type: 'task.completed', data: { taskId: done.id, agentId: 'executor' } });

    const allTasks = tm.getAll();
    expect(allTasks).toHaveLength(1); // only the original task
  });

  it('creates fix sub-task when verify task fails', () => {
    // Create and complete the original task
    const task = tm.create({
      title: 'Build feature',
      description: 'Build it',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      taskKind: 'execute',
      runId: 'run-2',
      verificationRequired: true,
    });
    tm.claim(task.id, 'executor', 1);
    tm.transition(task.id, 'working', 'executor', 2);
    tm.transition(task.id, 'done', 'executor', 3, { result: 'built' });
    bus.emit({ type: 'task.completed', data: { taskId: task.id, agentId: 'executor' } });

    // Find the auto-created verify task
    const verifyTask = tm.getAll().find(t => t.taskKind === 'verify')!;
    expect(verifyTask).toBeDefined();

    // Simulate verify failure
    tm.claim(verifyTask.id, 'verifier', 1);
    tm.transition(verifyTask.id, 'working', 'verifier', 2);
    tm.transition(verifyTask.id, 'failed', 'verifier', 3, { error: 'tests fail' });
    bus.emit({ type: 'task.failed', data: { taskId: verifyTask.id, agentId: 'verifier' } });

    // Should have created a fix sub-task
    const fixTask = tm.getAll().find(t => t.taskKind === 'fix');
    expect(fixTask).toBeDefined();
    expect(fixTask!.parentTaskId).toBe(verifyTask.id);
    expect(fixTask!.runId).toBe('run-2');
    expect(fixTask!.title).toContain('Fix');
  });

  it('does NOT create fix task for non-verify task failures', () => {
    const task = tm.create({
      title: 'Regular task',
      description: '',
      requiredCapabilities: ['coding'],
      createdBy: 'a',
      taskKind: 'execute',
    });
    tm.claim(task.id, 'executor', 1);
    tm.transition(task.id, 'working', 'executor', 2);
    tm.transition(task.id, 'failed', 'executor', 3, { error: 'crash' });
    bus.emit({ type: 'task.failed', data: { taskId: task.id, agentId: 'executor' } });

    expect(tm.getAll()).toHaveLength(1); // no fix sub-task
  });

  it('respects max retry count (no fix after 2 failures)', () => {
    const task = tm.create({
      title: 'Build',
      description: '',
      requiredCapabilities: ['coding'],
      createdBy: 'orchestrator',
      taskKind: 'execute',
      runId: 'run-3',
      verificationRequired: true,
    });
    tm.claim(task.id, 'executor', 1);
    tm.transition(task.id, 'working', 'executor', 2);
    tm.transition(task.id, 'done', 'executor', 3, { result: 'done' });
    bus.emit({ type: 'task.completed', data: { taskId: task.id, agentId: 'executor' } });

    // Fail verify 1
    const v1 = tm.getAll().find(t => t.taskKind === 'verify')!;
    tm.claim(v1.id, 'verifier', 1);
    tm.transition(v1.id, 'working', 'verifier', 2);
    tm.transition(v1.id, 'failed', 'verifier', 3, { error: 'fail 1' });
    bus.emit({ type: 'task.failed', data: { taskId: v1.id, agentId: 'verifier' } });

    // Fix 1 created
    const f1 = tm.getAll().find(t => t.taskKind === 'fix')!;
    tm.claim(f1.id, 'fixer', 1);
    tm.transition(f1.id, 'working', 'fixer', 2);
    tm.transition(f1.id, 'done', 'fixer', 3, { result: 'fixed' });
    bus.emit({ type: 'task.completed', data: { taskId: f1.id, agentId: 'fixer' } });

    // Fix complete triggers re-verify (verificationRequired inherited)
    const v2 = tm.getAll().filter(t => t.taskKind === 'verify' && t.status === 'pending');
    expect(v2.length).toBe(1); // second verify created

    // Fail verify 2
    tm.claim(v2[0].id, 'verifier', 1);
    tm.transition(v2[0].id, 'working', 'verifier', 2);
    tm.transition(v2[0].id, 'failed', 'verifier', 3, { error: 'fail 2' });
    bus.emit({ type: 'task.failed', data: { taskId: v2[0].id, agentId: 'verifier' } });

    // Fix 2 created
    const fixes = tm.getAll().filter(t => t.taskKind === 'fix' && t.status === 'pending');
    expect(fixes.length).toBe(1);
    tm.claim(fixes[0].id, 'fixer', 1);
    tm.transition(fixes[0].id, 'working', 'fixer', 2);
    tm.transition(fixes[0].id, 'done', 'fixer', 3, { result: 'fixed again' });
    bus.emit({ type: 'task.completed', data: { taskId: fixes[0].id, agentId: 'fixer' } });

    // Verify 3
    const v3 = tm.getAll().filter(t => t.taskKind === 'verify' && t.status === 'pending');
    expect(v3.length).toBe(1);
    tm.claim(v3[0].id, 'verifier', 1);
    tm.transition(v3[0].id, 'working', 'verifier', 2);
    tm.transition(v3[0].id, 'failed', 'verifier', 3, { error: 'fail 3' });
    bus.emit({ type: 'task.failed', data: { taskId: v3[0].id, agentId: 'verifier' } });

    // After 2 fix cycles (3 verify failures), should NOT create another fix
    const pendingFixes = tm.getAll().filter(t => t.taskKind === 'fix' && t.status === 'pending');
    expect(pendingFixes.length).toBe(0);
  });
});
