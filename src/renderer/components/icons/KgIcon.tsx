import React from 'react';

interface KgIconProps {
    size?: number;
    className?: string;
}

const KgIcon: React.FC<KgIconProps> = ({ size = 16, className }) => (
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
        <circle cx="6" cy="8" r="2.5" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="14" r="3" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="17" r="2.5" />
        <line x1="8" y1="9" x2="10" y2="12" />
        <line x1="16" y1="7" x2="14" y2="12" />
        <line x1="7" y1="17" x2="9.5" y2="15.5" />
        <line x1="14.5" y1="15.5" x2="17" y2="16" />
        <line x1="7" y1="10" x2="5" y2="16" />
    </svg>
);

export default KgIcon;
