import React from 'react';

interface CartoglyphIconProps {
    size?: number;
    className?: string;
}

const CartoglyphIcon: React.FC<CartoglyphIconProps> = ({ size = 24, className = '' }) => {
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
            {/* Globe outline */}
            <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
            {/* Latitude lines */}
            <ellipse cx="12" cy="12" rx="10" ry="4" strokeWidth="1" />
            <ellipse cx="12" cy="12" rx="6" ry="10" strokeWidth="1" />
            {/* Meridian */}
            <line x1="2" y1="12" x2="22" y2="12" strokeWidth="1" />
            {/* Map pin */}
            <circle cx="15" cy="8" r="2" fill="currentColor" stroke="none" />
            <path d="M15 10 L15 13" strokeWidth="2" />
            <circle cx="15" cy="13.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
    );
};

export default CartoglyphIcon;
