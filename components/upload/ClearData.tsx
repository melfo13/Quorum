'use client';

import { useTransition } from 'react';
import { clearData } from '@/app/actions';

/** A text button (valid inside a paragraph) that removes the current files: the app goes back to empty. */
export function ClearData({ label }: { label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => clearData())}
      className="cursor-pointer underline decoration-control underline-offset-[3px] hover:text-ink hover:decoration-ink disabled:cursor-wait"
    >
      {pending ? 'Quitando…' : label}
    </button>
  );
}
