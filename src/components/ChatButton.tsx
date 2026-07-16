import type { ChatButtonResponse } from '../lib/chatResponseRenderer';

export type ChatButtonProps = {
  label: string;
  href: string;
  variant?: ChatButtonResponse['variant'];
  size?: ChatButtonResponse['size'];
  target?: ChatButtonResponse['target'];
  className?: string;
};

const EXTERNAL_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Link-style button for structured agent chat responses. */
export function ChatButton({
  label,
  href,
  variant = 'primary',
  size = 'md',
  target = '_blank',
  className = '',
}: ChatButtonProps) {
  const classes = ['aui-chat-btn', `aui-chat-btn--${variant}`, `aui-chat-btn--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={classes}
    >
      <span className="aui-chat-btn-label">{label}</span>
      {target === '_blank' ? <span className="aui-chat-btn-icon">{EXTERNAL_ICON}</span> : null}
    </a>
  );
}
