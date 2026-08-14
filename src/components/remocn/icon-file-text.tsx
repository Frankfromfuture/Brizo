"use client";

export interface FileTextIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function FileTextIcon({ size = 48, color = "currentColor", strokeWidth = 2, className }: FileTextIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="remocn-file-page" d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" pathLength={1} />
      <path className="remocn-file-fold" d="M14 2v5a1 1 0 0 0 1 1h5" pathLength={1} />
      <path className="remocn-file-line" d="M8 9h2" pathLength={1} />
      <path className="remocn-file-line" d="M8 13h8" pathLength={1} />
      <path className="remocn-file-line" d="M8 17h8" pathLength={1} />
    </svg>
  );
}

export const FileTextIconStatic = FileTextIcon;
