import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionModal } from '../../src/renderer/components/PermissionModal';

describe('PermissionModal', () => {
  const baseRequest = {
    request_id: 'req-1',
    tool_name: 'write_file',
    command_key: 'fs.write',
    args_preview: '{"path":"/tmp/a.txt"}',
  };

  const mockOnDecision = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all decision buttons', () => {
    render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={true}
      />
    );

    expect(screen.getByText('Allow once')).toBeInTheDocument();
    expect(screen.getByText('Deny')).toBeInTheDocument();
    expect(screen.getByText('Allow for session')).toBeInTheDocument();
    expect(screen.getByText('Always allow (remember)')).toBeInTheDocument();
    expect(screen.getByText('Never allow (remember)')).toBeInTheDocument();
  });

  it('calls onDecision with the selected choice', () => {
    render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={true}
      />
    );

    fireEvent.click(screen.getByText('Allow for session'));
    expect(mockOnDecision).toHaveBeenCalledWith(baseRequest, 'Yes, allow for session');
  });

  it('approves on Enter when the pane is active', async () => {
    render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={true}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter', bubbles: true });
    await waitFor(() => expect(mockOnDecision).toHaveBeenCalledWith(baseRequest, 'Yes'));
  });

  it('denies on Escape when the pane is active', async () => {
    render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={true}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
    await waitFor(() => expect(mockOnDecision).toHaveBeenCalledWith(baseRequest, 'No'));
  });

  it('does not capture Enter when the pane is not active', () => {
    render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={false}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter', bubbles: true });
    expect(mockOnDecision).not.toHaveBeenCalled();
  });

  it('does not capture Escape when the pane is not active', () => {
    render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={false}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
    expect(mockOnDecision).not.toHaveBeenCalled();
  });

  it('auto-focuses the modal container', () => {
    const { container } = render(
      <PermissionModal
        request={baseRequest}
        pendingCount={1}
        onDecision={mockOnDecision}
        isActivePane={true}
      />
    );

    const modal = container.querySelector('[tabIndex="-1"]');
    expect(document.activeElement).toBe(modal);
  });
});
