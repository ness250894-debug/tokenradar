import React from "react";
import { Composition } from "remotion";
import { TopGainerUpdate } from "./TopGainerUpdate";

// Define the schema for the props we'll pass dynamically
export type TopGainerProps = {
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  riskScore: number;
  marketCap: number;
};

// Default props for the Studio preview
const defaultProps: TopGainerProps = {
  tokenName: "Ethereum",
  symbol: "ETH",
  price: 3500.5,
  priceChange24h: 5.2,
  riskScore: 2.1,
  marketCap: 420000000000,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TopGainerUpdate"
        component={TopGainerUpdate}
        durationInFrames={450} // 15 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
    </>
  );
};
