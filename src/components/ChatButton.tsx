import React from 'react';

export interface ChatButtonProps {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  target?: '_blank' | '_self';
  className?: string;
}

/**
 * ChatButton — A professional button component for agent responses
 * Used when agent needs to return clickable links (projects, portals, etc.)
 */
export const ChatButton: React.FC<ChatButtonProps> = ({
  label,
  href,
  variant = 'primary',
  size = 'md',
  target = '_blank',
  className = '',
}) => {
  const baseStyles = 'font-medium rounded-lg transition-colors duration-200 inline-flex items-center gap-2 whitespace-nowrap';

  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50 active:bg-blue-100',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {label}
      {target === '_blank' && (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      )}
    </a>
  );
};

export default ChatButton;
