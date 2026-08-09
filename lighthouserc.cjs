module.exports = {
  ci: {
    collect: {
      staticDistDir: "./out",
      url: [
        "http://localhost/",
        "http://localhost/tokens.html",
        "http://localhost/search-intent.html",
        "http://localhost/category/ethereum-ecosystem.html",
        "http://localhost/best-crypto-hardware-wallets.html",
      ],
      numberOfRuns: 2,
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.7 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 3000 }],
        "total-blocking-time": ["warn", { maxNumericValue: 250 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-byte-weight": ["warn", { maxNumericValue: 1200000 }],
        "uses-responsive-images": "warn",
        "uses-optimized-images": "warn",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
