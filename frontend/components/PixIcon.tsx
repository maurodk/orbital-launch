// frontend/src/components/PixIcon.tsx

import type { SVGProps } from "react";

export const PixIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    width="1em"
    height="1em"
    {...props}
  >
    <path
      fill="currentColor"
      d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m-28.34 56h22.49l-28.15 48h-22.49Zm-1.85 64h22.49l42.22-72h22.49l-42.22 72h28.15v16h-50.66Zm84.34-16h-22.49l28.15-48h22.49Z"
    />
  </svg>
);
