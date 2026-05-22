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

  it('should render when isOpen is true', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    expect(screen.getByText('Create Signature')).toBeInTheDocument();
  });

  it('should close when close button is clicked', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const closeButton = screen.getByTestId('x-icon').parentElement;
    fireEvent.click(closeButton!);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close when Cancel button is clicked', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should have a canvas element for drawing', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('should have color picker', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const colorInput = document.querySelector('input[type="color"]');
    expect(colorInput).toBeInTheDocument();
  });

  it('should have Clear button', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('should have disabled Save button initially in draw mode', () => {
    render(<SignatureModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);
    const saveButton = screen.getByText('Save Signature');
    expect(saveButton).toBeDisabled();
  });
});
