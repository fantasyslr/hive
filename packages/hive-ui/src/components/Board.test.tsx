// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Board } from './Board';
import type { Task } from '../lib/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36),
    title: 'Test Task',
    description: '',
    requiredCapabilities: [],
    status: 'pending',
    assignee: null,
    createdBy: 'user',
    result: null,
    error: null,
    version: 1,
    createdAt: '2026-03-31T00:00:00Z',
    updatedAt: '2026-03-31T00:00:00Z',
    ...overrides,
  };
}

describe('Board', () => {
  it('renders 5 columns', () => {
    render(<Board tasks={[]} selectedAgent={null} onSelectTask={() => {}} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Claimed')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('distributes tasks to correct columns', () => {
    const tasks = [
      makeTask({ id: '1', title: 'Pending Task', status: 'pending' }),
      makeTask({ id: '2', title: 'Working Task', status: 'working' }),
      makeTask({ id: '3', title: 'Done Task', status: 'done' }),
      makeTask({ id: '4', title: 'Failed Task', status: 'failed' }),
      makeTask({ id: '5', title: 'Claimed Task', status: 'claimed' }),
    ];

    render(<Board tasks={tasks} selectedAgent={null} onSelectTask={() => {}} />);

    expect(screen.getByText('Pending Task')).toBeInTheDocument();
    expect(screen.getByText('Working Task')).toBeInTheDocument();
    expect(screen.getByText('Done Task')).toBeInTheDocument();
    expect(screen.getByText('Failed Task')).toBeInTheDocument();
    expect(screen.getByText('Claimed Task')).toBeInTheDocument();
  });

  it('renders empty columns when no tasks', () => {
    render(<Board tasks={[]} selectedAgent={null} onSelectTask={() => {}} />);

    // All 5 column headers should exist
    const headers = ['Pending', 'Claimed', 'Working', 'Done', 'Failed'];
    headers.forEach((h) => {
      expect(screen.getByText(h)).toBeInTheDocument();
    });
  });
});
