import React from 'react';

interface SmokestackIconProps {
    size?: number;
    className?: string;
}

const SmokestackIcon: React.FC<SmokestackIconProps> = ({ size = 16, className }) => (
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
        <rect x="5" y="10" width="5" height="12" rx="0.5" />
        <circle cx="7.5" cy="6" r="2" />
        <circle cx="9" cy="3" r="1.5" />
        <rect x="12" y="14" width="4" height="8" rx="0.5" />
        <rect x="18" y="16" width="3" height="6" rx="0.5" />
        <path d="M2 22h20" />
    </svg>
);

export default SmokestackIcon;
