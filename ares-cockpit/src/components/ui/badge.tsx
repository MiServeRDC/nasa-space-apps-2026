import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[var(--radius-full)] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider shadow-none transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-[var(--color-border)] bg-[var(--color-surface-l2)] text-[var(--color-ink-display)]',
        spatial:
          'border-[oklch(0.72_0.16_235/0.45)] bg-[oklch(0.72_0.16_235/0.14)] text-[var(--color-accent-spatial)]',
        nominal:
          'border-[oklch(0.72_0.17_152/0.45)] bg-[oklch(0.72_0.17_152/0.14)] text-[var(--color-status-nominal)]',
        caution:
          'border-[oklch(0.78_0.16_75/0.45)] bg-[oklch(0.78_0.16_75/0.14)] text-[var(--color-status-caution)]',
        critical:
          'border-[oklch(0.64_0.22_25/0.55)] bg-[oklch(0.64_0.22_25/0.18)] text-[var(--color-status-critical)]',
        simulated:
          'border-[oklch(0.68_0.17_300/0.50)] bg-[oklch(0.68_0.17_300/0.16)] text-[var(--color-status-simulated)]',
        missing:
          'ares-missing-hatch rounded-[var(--radius-micro)] text-[var(--color-status-caution)]',
        outline:
          'border-[var(--color-border)] bg-black text-[var(--color-ink-meta)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
