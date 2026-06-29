import React from 'react';

interface RadioTowerIconProps {
    size?: number;
    className?: string;
}

const RadioTowerIcon: React.FC<RadioTowerIconProps> = ({ size = 24, className = '' }) => {
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
            <line x1="12" y1="10" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
            <line x1="9" y1="16" x2="15" y2="16" />
            <line x1="10" y1="22" x2="12" y2="10" />
            <line x1="14" y1="22" x2="12" y2="10" />
            <path d="M8.5 7.5a5 5 0 0 1 7 0" strokeWidth="1.5" />
            <path d="M6 5a8.5 8.5 0 0 1 12 0" strokeWidth="1.5" />
            <circle cx="12" cy="9" r="1" fill="currentColor" stroke="none" />
        </svg>
    );
};

export default RadioTowerIcon;
