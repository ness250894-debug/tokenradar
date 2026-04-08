import React from "react";

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
    className={className}
    style={style}
  >
    <circle cx="12" cy="12" r="12" fill="white" />
    <path 
      d="M17.665 7.717l-10.73 4.837c-.71.286-.703.661-.122.862l2.552.92 1.066 3.302c.138.318.064.423.464.423.31 0 .434-.141.584-.283l1.15-1.114 3.1 2.29c.536.294.938.142 1.071-.497l2.18-10.24c.214-.858-.336-1.25-.91-1.02z" 
      fill="black" 
    />
  </svg>
);
