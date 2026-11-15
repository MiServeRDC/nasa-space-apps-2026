import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import type { ComponentPropsWithoutRef } from 'react';

export function CockpitSelect({ className = '', ...props }: ComponentPropsWithoutRef<'select'>) {
  return (
    <span className="cockpit-select">
      <select {...props} className={className} />
      <CaretDownIcon aria-hidden="true" size={15} weight="bold" />
    </span>
  );
}

export function CockpitSummary({ children, ...props }: ComponentPropsWithoutRef<'summary'>) {
  return (
    <summary {...props}>
      <CaretRightIcon className="disclosure-caret" aria-hidden="true" size={15} weight="bold" />
      <span className="disclosure-label">{children}</span>
    </summary>
  );
}
