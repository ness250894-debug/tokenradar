import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTokenDetail, getAllTokens } from '@/lib/content-loader';
import { getTokenTechnical, getPilotTokenIds } from '@/lib/token-technical-data';
import { TransferGuideTemplate } from '@/components/TransferGuideTemplate';
import { canonicalPath } from '@/lib/seo';

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export const dynamicParams = false;

/**
 * Metadata Generation for pSEO
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token: tokenId } = await params;
  const token = await getTokenDetail(tokenId);
  const technical = getTokenTechnical(tokenId);

  if (!token || !technical) {
    return {
      title: 'Guide Not Found',
    };
  }

  const symbol = token.symbol.toUpperCase();
  const name = token.name;

  const ogImage = `/og/token/${token.id}.png`;

  return {
    title: `How to Transfer ${name} (${symbol}) to Ledger: 2026 Security Guide`,
    description: `TokenRadar checklist for transferring ${name} (${symbol}) to a Ledger hardware wallet. Review ${technical.network} network details before withdrawing.`,
    keywords: [`transfer ${name} to ledger`, `store ${symbol} on ledger`, `${name} ledger wallet`, `secure ${symbol} offline`],
    alternates: {
      canonical: canonicalPath(`/${tokenId}/transfer-to-ledger`),
    },
    openGraph: {
      title: `Secure ${name} (${symbol}) on Ledger`,
      description: `TokenRadar transfer checklist for moving ${name} via the ${technical.network} network.`,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `How to Transfer ${name} (${symbol}) to Ledger`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `Secure ${name} (${symbol}) on Ledger`,
      description: `TokenRadar transfer checklist for moving ${name} via the ${technical.network} network.`,
      images: [ogImage],
    },
  };
}

/**
 * Pilot Lock: Only generate static paths for verified top 20 tokens.
 * This prevents indexing of low-quality/incomplete guide pages.
 */
export async function generateStaticParams() {
  const tokens = await getAllTokens();
  // Only statically generate for tokens we have technical data for
  const pilotIds = new Set(getPilotTokenIds());
  return tokens
    .filter(t => pilotIds.has(t.id))
    .map((t) => ({ token: t.id }));
}

export default async function TransferGuidePage({ params }: PageProps) {
  const { token: tokenId } = await params;
  const token = await getTokenDetail(tokenId);
  const technical = getTokenTechnical(tokenId);

  // Safety Check: If not in pilot batch or not found, return 404
  if (!token || !technical) {
    notFound();
  }

  // Schema.org HowTo Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to Transfer ${token.name} (${token.symbol.toUpperCase()}) to Ledger`,
    "description": `Step-by-step security guide for moving ${token.name} from an exchange to cold storage on the ${technical.network} network.`,
    "step": [
      {
        "@type": "HowToStep",
        "name": "Prepare Ledger Live",
        "text": "Open Ledger Live, unlock the device, and check for firmware or app updates."
      },
      {
        "@type": "HowToStep",
        "name": `Install ${technical.ledgerAppName} App`,
        "text": `Install the ${technical.ledgerAppName} app from the Ledger Live app catalog.`
      },
      {
        "@type": "HowToStep",
        "name": "Generate and verify the receive address",
        "text": `Navigate to 'Receive' in Ledger Live, select the ${token.name} or ${technical.ledgerAppName} account, and verify the address on the physical Ledger screen.`
      },
      {
        "@type": "HowToStep",
        "name": "Withdraw from the exchange",
        "text": `Withdraw ${token.symbol.toUpperCase()} from your exchange using the ${technical.network} network only, starting with a small test transfer.`
      }
    ]
  };

  return (
    <main className="container-narrow" style={{ paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-4xl)" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TransferGuideTemplate 
        tokenName={token.name} 
        symbol={token.symbol} 
        slug={tokenId}
        technical={technical} 
      />
    </main>
  );
}
