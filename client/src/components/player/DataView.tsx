import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';
import type { NodeOut } from '@/types/scenario';

// CRITICAL: only same-origin /media/ paths are permitted in href/src attributes.
// External URLs (http(s)://, javascript:, data:, file:, …) are rejected.
export const ALLOWED_URI_REGEXP = /^\/media\//;

const NEXT_BUTTON_DELAY_MS = 1_000;

export interface DataViewProps {
  node: NodeOut;
  onNext: () => void;
}

export function DataView({ node, onNext }: DataViewProps) {
  const html = String(node.data.html ?? '');
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP,
    ADD_ATTR: ['target', 'rel'],
  });

  const [canProceed, setCanProceed] = useState(false);
  useEffect(() => {
    setCanProceed(false);
    const timer = window.setTimeout(() => setCanProceed(true), NEXT_BUTTON_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [node.id]);

  const attachments = Array.isArray(node.data.attachments) ? node.data.attachments : [];

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-fg">{node.title}</h2>
      </header>
      <div
        data-testid="data-view-content"
        className="prose max-w-none rounded-xl border border-border bg-bg p-4 text-sm text-fg"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
      {attachments.length ? (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <li key={String(a) + i} className="text-xs text-fg-muted">
              {String(a)}
            </li>
          ))}
        </ul>
      ) : null}
      <Button onClick={onNext} disabled={!canProceed}>
        Далее
      </Button>
    </section>
  );
}

export default DataView;
