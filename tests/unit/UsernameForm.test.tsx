import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UsernameForm } from '../../components/UsernameForm';

const mockUpdateUser = vi.fn();
const mockIsUsernameAvailable = vi.fn();

vi.mock('../../lib/auth-client', () => ({
    authClient: {
        updateUser: (...args: any[]) => mockUpdateUser(...args),
        isUsernameAvailable: (...args: any[]) => mockIsUsernameAvailable(...args),
    },
}));

describe('UsernameForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: true } });
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onSuccess(); return Promise.resolve(); });
    });

    it('rejects an invalid format before ever checking availability', () => {
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'ab' } });
        expect(screen.getByText(/3–30 characters/)).toBeInTheDocument();
        expect(mockIsUsernameAvailable).not.toHaveBeenCalled();
    });

    it('shows an available indicator for a free username', async () => {
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'brand_new' } });
        await waitFor(() => expect(screen.getByText('✓ Available')).toBeInTheDocument());
    });

    it('shows a taken indicator and blocks submit for an unavailable username', async () => {
        mockIsUsernameAvailable.mockResolvedValue({ data: { available: false } });
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'already_taken' } });
        await waitFor(() => expect(screen.getByText('✗ Already taken')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('calls updateUser and onSuccess on submit', async () => {
        const onSuccess = vi.fn();
        render(<UsernameForm onSuccess={onSuccess} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('new_handle'));
        expect(mockUpdateUser).toHaveBeenCalledWith({ username: 'new_handle' }, expect.any(Object));
    });

    it('shows a fallback error message when submit fails', async () => {
        mockUpdateUser.mockImplementation((_body: any, handlers: any) => { handlers.onError({ error: {} }); return Promise.resolve(); });
        render(<UsernameForm onSuccess={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. planner_pro'), { target: { value: 'new_handle' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(screen.getByText(/may already be taken, or something went wrong/)).toBeInTheDocument());
    });

    it('pre-fills an existing username', () => {
        render(<UsernameForm initialValue="current_handle" onSuccess={vi.fn()} />);
        expect(screen.getByDisplayValue('current_handle')).toBeInTheDocument();
    });
});
