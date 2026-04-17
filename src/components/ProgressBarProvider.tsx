"use client";

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';
import type { ReactNode } from 'react';

export default function ProgressBarProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ProgressBar
        height="3px"
        color="var(--accent-primary)"
        options={{ showSpinner: false }}
        shallowRouting
      />
    </>
  );
}
