

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
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932L18.901 1.153zM17.61 20.644h2.039L6.486 3.24H4.298L17.61 20.644z" />
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
    <path 
      d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 1.566 4.802c.188.518.094.723.664.723.44 0 .634-.201.884-.443l1.9-1.847 4.54 3.354c.836.46 1.438.222 1.646-.778l2.98-14.04c.304-1.218-.466-1.77-1.28-1.49z" 
    />
  </svg>
);
