import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignatureModal from '../../src/renderer/components/SignatureModal';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="x-icon">X</span>,
  Pen: () => <span data-testid="pen-icon">Pen</span>,
  Type: () => <span data-testid="type-icon">Type</span>,
  Trash2: () => <span data-testid="trash-icon">Trash</span>,
}));

// Mock fetch for Google Fonts loading
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('') })));

describe('SignatureModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <SignatureModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render when isOpen is true', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => {
      expect(screen.getByText('Create Signature')).toBeInTheDocument();
    }, { timeout: 3000 });
  }, 10000);

  it('should close when close button is clicked', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => screen.getByTestId('x-icon'), { timeout: 3000 });
    const closeButton = screen.getByTestId('x-icon').parentElement;
    fireEvent.click(closeButton!);
    expect(mockOnClose).toHaveBeenCalled();
  }, 10000);

  it('should close when Cancel button is clicked', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => screen.getByText('Cancel'), { timeout: 3000 });
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(mockOnClose).toHaveBeenCalled();
  }, 10000);

  it('should have a canvas element for drawing', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => document.querySelector('canvas'), { timeout: 3000 });
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  }, 10000);

  it('should have color picker', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => document.querySelector('input[type="color"]'), { timeout: 3000 });
    const colorInput = document.querySelector('input[type="color"]');
    expect(colorInput).toBeInTheDocument();
  }, 10000);

  it('should have Clear button', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => screen.getByText('Clear'), { timeout: 3000 });
    expect(screen.getByText('Clear')).toBeInTheDocument();
  }, 10000);

  it('should have disabled Save button initially in draw mode', async () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    await waitFor(() => screen.getByText('Save Signature'), { timeout: 3000 });
    const saveButton = screen.getByText('Save Signature');
    expect(saveButton).toBeDisabled();
  }, 10000);
});
