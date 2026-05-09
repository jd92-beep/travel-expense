import type { Person } from '../lib/types';
import { cn } from '../lib/cn';
import type { CSSProperties } from 'react';

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const latin = trimmed.match(/[A-Za-z]/g)?.join('').slice(0, 2).toUpperCase();
  return latin || Array.from(trimmed).slice(0, 2).join('');
}

export function AvatarBadge({
  person,
  size = 'md',
  showName = false,
  className,
}: {
  person: Person;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}) {
  const seed = person.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const tilt = seed % 2 === 0 ? -7 : 7;
  return (
    <span className={cn('avatar-wrap', showName && 'with-name', className)}>
      <span
        className={cn('avatar-badge', `avatar-${size}`)}
        style={{ '--avatar-color': person.color, '--avatar-tilt': `${tilt}deg` } as CSSProperties}
        aria-label={person.name}
        title={person.name}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle cx="32" cy="32" r="30" className="avatar-bg" />
          <path className="avatar-hair" d="M16 29c2-12 11-20 23-17 7 2 12 8 12 18-7-6-16-6-23-2-4 2-7 2-12 1z" />
          <circle cx="32" cy="36" r="16" className="avatar-face" />
          <path className="avatar-smile" d="M24 39c4 5 12 5 16 0" />
          <circle cx="26" cy="33" r="2" className="avatar-eye" />
          <circle cx="38" cy="33" r="2" className="avatar-eye" />
        </svg>
        <b>{initials(person.name)}</b>
      </span>
      {showName && <span className="avatar-name">{person.name}</span>}
    </span>
  );
}
