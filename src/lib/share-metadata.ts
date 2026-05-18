import type { Metadata } from "next";

export const DEFAULT_SHARE_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "TokenRadar - Data-Driven Crypto Analysis & Token Research",
};

interface ShareMetadataInput {
  title: string;
  description: string;
  type?: "website" | "article";
  imageAlt?: string;
  imageUrl?: string;
}

function buildShareImage(input: ShareMetadataInput) {
  return {
    ...DEFAULT_SHARE_IMAGE,
    url: input.imageUrl || DEFAULT_SHARE_IMAGE.url,
    alt: input.imageAlt || DEFAULT_SHARE_IMAGE.alt,
  };
}

export function buildOpenGraphMetadata(input: ShareMetadataInput): NonNullable<Metadata["openGraph"]> {
  return {
    title: input.title,
    description: input.description,
    type: input.type || "website",
    images: [buildShareImage(input)],
  };
}

export function buildTwitterMetadata(input: ShareMetadataInput): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary_large_image",
    title: input.title,
    description: input.description,
    images: [input.imageUrl || DEFAULT_SHARE_IMAGE.url],
  };
}
