import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'ares-interactive inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] border font-sans text-xs font-medium shadow-none transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-[var(--color-border)] bg-[var(--color-surface-l2)] text-[var(--color-ink-display)] hover:border-[var(--color-border-active)] hover:bg-[oklch(0.20_0.012_250)]',
        primary:
          'border-[oklch(0.72_0.16_235/0.55)] bg-[oklch(0.72_0.16_235/0.16)] text-[var(--color-ink-display)] hover:border-[var(--color-accent-spatial)] hover:bg-[oklch(0.72_0.16_235/0.24)]',
        nominal:
          'border-[oklch(0.72_0.17_152/0.45)] bg-[oklch(0.72_0.17_152/0.14)] text-[var(--color-status-nominal)] hover:border-[var(--color-status-nominal)] hover:bg-[oklch(0.72_0.17_152/0.22)]',
        warning:
          'border-[oklch(0.78_0.16_75/0.45)] bg-[oklch(0.78_0.16_75/0.14)] text-[var(--color-status-caution)] hover:border-[var(--color-status-caution)] hover:bg-[oklch(0.78_0.16_75/0.22)]',
        destructive:
          'border-[oklch(0.64_0.22_25/0.55)] bg-[oklch(0.64_0.22_25/0.16)] text-[var(--color-status-critical)] hover:border-[var(--color-status-critical)] hover:bg-[oklch(0.64_0.22_25/0.24)]',
        simulated:
          'border-[oklch(0.68_0.17_300/0.50)] bg-[oklch(0.68_0.17_300/0.16)] text-[var(--color-status-simulated)] hover:border-[var(--color-status-simulated)] hover:bg-[oklch(0.68_0.17_300/0.24)]',
        outline:
          'border-[var(--color-border)] bg-black text-[var(--color-ink-body)] hover:border-[var(--color-border-active)] hover:text-[var(--color-ink-display)]',
        ghost:
          'border-transparent bg-transparent text-[var(--color-ink-meta)] hover:bg-[var(--color-surface-l2)] hover:text-[var(--color-ink-display)]',
        link:
          'border-transparent bg-transparent text-[var(--color-accent-spatial)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-1.5',
        sm: 'h-7 px-2.5 text-[11px]',
        lg: 'h-10 px-4 text-sm',
        action:
          'ares-primary-action min-h-[48px] px-4 py-2 font-mono text-[11px] font-semibold tracking-wider uppercase',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
