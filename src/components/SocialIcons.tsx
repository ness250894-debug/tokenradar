import { SOCIAL_ICON_PATHS } from "../lib/social-icons";

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const XIcon: React.FC<IconProps> = ({ size = 24, className, style }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="currentColor" 
    className={className}
    style={style}
  >
    <path d={SOCIAL_ICON_PATHS.x} />
  </svg>
);

export const TelegramIcon: React.FC<IconProps> = ({ size = 24, className, style }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="currentColor" 
    className={className}
    style={style}
  >
    <path d={SOCIAL_ICON_PATHS.telegram} />
  </svg>
);

export const InstagramIcon: React.FC<IconProps> = ({ size = 24, className, style }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d={SOCIAL_ICON_PATHS.instagram} />
  </svg>
);

export const ThreadsIcon: React.FC<IconProps> = ({ size = 24, className, style }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d={SOCIAL_ICON_PATHS.threads} />
  </svg>
);

export const TikTokIcon: React.FC<IconProps> = ({ size = 24, className, style }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d={SOCIAL_ICON_PATHS.tiktok} />
  </svg>
);

export const EmailIcon: React.FC<IconProps> = ({ size = 24, className, style }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
    style={style}
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);
