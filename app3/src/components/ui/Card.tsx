import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className = '', style }: CardProps) {
  return (
    <div className={`glass rounded-2xl p-4 ${className}`} style={style}>
      {children}
    </div>
  );
}
