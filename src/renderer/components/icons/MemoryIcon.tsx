import React from 'react';

interface MemoryIconProps {
    size?: number;
    className?: string;
}

const MemoryIcon: React.FC<MemoryIconProps> = ({ size = 24, className = '' }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M12 2C8.5 2 5 4.5 5 9c0 2.5 1 4 2 5.5.5.8.5 1.5.5 2.5v3c0 .5.5 1 1 1h7c.5 0 1-.5 1-1v-3c0-1 0-1.7.5-2.5 1-1.5 2-3 2-5.5 0-4.5-3.5-7-7-7z" />

            <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="16" cy="8" r="0.8" fill="currentColor" stroke="none" />

            <path d="M8 11c1-1 2 1 4 0s2-1 4 0" strokeWidth="1.5" />

            <line x1="9" y1="18" x2="15" y2="18" strokeWidth="1.5" />
        </svg>
    );
};

export default MemoryIcon;
