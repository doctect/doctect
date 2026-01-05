import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const SimpleComponent = ({ message }: { message: string }) => {
    return <div>{message}</div>;
};

describe('SimpleComponent', () => {
    it('renders the message correctly', () => {
        render(<SimpleComponent message="Hello, Vitest!" />);
        expect(screen.getByText('Hello, Vitest!')).toBeInTheDocument();
    });
});
