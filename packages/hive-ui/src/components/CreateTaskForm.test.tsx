// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTaskForm } from './CreateTaskForm';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('CreateTaskForm', () => {
  it('submits payload with camelCase field names', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', title: 'Campaign Q2', status: 'pending', description: '', requiredCapabilities: ['general'], assignee: null, createdBy: 'web-ui', result: null, error: null, version: 1, createdAt: '', updatedAt: '' }),
    });

    render(<CreateTaskForm onCreated={onCreated} />);

    // Open form
    await user.click(screen.getByText('+ New Task'));

    // Fill in title
    await user.type(screen.getByPlaceholderText('Task title'), 'Campaign Q2');

    // Submit
    await user.click(screen.getByText('Create'));

    // Wait for async submit
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.title).toBe('Campaign Q2');
    expect(body.createdBy).toBe('web-ui');
    expect(body.taskKind).toBe('execute');
    expect(body).toHaveProperty('verificationRequired');
    expect(body).not.toHaveProperty('task_kind');
    expect(body).not.toHaveProperty('verification_required');
  });
});
