import { TrendingSidebar } from "@/components/TrendingSidebar";
import { StickyBanner } from "@/components/StickyBanner";
import { notFound } from "next/navigation";
import { getTokenDetail } from "@/lib/content-loader";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}

/**
 * Shared layout for all `/[token]` routes.
 * Injects the right-hand Trending Sidebar and the bottom Sticky Conversion Banner.
 */
export default async function TokenLayout({ children, params }: LayoutProps) {
  const { token: tokenId } = await params;
  
  // Verify token exists, otherwise 404 (handled normally by page.tsx, but good practice here)
  const detail = getTokenDetail(tokenId);
  if (!detail) notFound();

  return (
    <>
      <div className="container">
        <div className="token-layout-grid">
          {/* Main Content Area (Overview, How to Buy, Price Prediction) */}
          <div className="token-main-content">
            {children}
          </div>
          
          {/* Global Sidebar */}
          <TrendingSidebar currentTokenId={tokenId} />
        </div>
      </div>
      
      {/* Global Ad Banner Fixed to Bottom */}
      <StickyBanner symbol={detail.symbol} />
    </>
  );
}
