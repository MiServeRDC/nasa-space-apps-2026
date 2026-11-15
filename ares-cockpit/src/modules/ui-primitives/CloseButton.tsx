import { XIcon } from '@phosphor-icons/react';

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="cockpit-close" aria-label={label} title={label} onClick={onClick}>
      <XIcon size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}
