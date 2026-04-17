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
  const detail = await getTokenDetail(tokenId);
  if (!detail) notFound();

  return (
    <>
      <div className="container">
        {/* Main Content Area (Overview, How to Buy, Price Prediction) centered via CSS */}
        <div className="token-main-content">
          {children}
        </div>
      </div>
      
      {/* Global Ad Banner Fixed to Bottom */}
      <StickyBanner symbol={detail.symbol} />
    </>
  );
}
