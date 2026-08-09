import { getSiteUrl } from "@/lib/seo";

export const TOKENRADAR_AUTHOR_NAME = "Pavlo Nakonechnyi";
export const TOKENRADAR_AUTHOR_PATH = "/authors/pavlo-nakonechnyi";
export const TOKENRADAR_AUTHOR_LINKEDIN = "https://www.linkedin.com/in/pavlo-nakonechnyi-633966402/";

export function buildAuthorPersonSchema(siteUrl = getSiteUrl()) {
  const url = `${siteUrl}${TOKENRADAR_AUTHOR_PATH}`;
  return {
    "@type": "Person",
    "@id": `${url}#person`,
    name: TOKENRADAR_AUTHOR_NAME,
    jobTitle: "Founder & Lead Researcher",
    url,
    sameAs: [TOKENRADAR_AUTHOR_LINKEDIN],
    worksFor: {
      "@id": `${siteUrl}/#organization`,
    },
  };
}

export function buildPublisherSchema(siteUrl = getSiteUrl()) {
  return {
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "TokenRadar",
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: `${siteUrl}/icon.png`,
    },
  };
}
