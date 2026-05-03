import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';
import type { JsonObject, NodeOut } from '@/types/scenario';

interface Attachment {
  id?: string | number;
  name?: string;
  type?: string;
  url?: string;
}

export interface DataViewProps {
  node: NodeOut;
  onContinue: () => void | Promise<void>;
}

function attachmentsFrom(data: JsonObject): Attachment[] {
  return Array.isArray(data.attachments) ? (data.attachments as Attachment[]) : [];
}

export default function DataView({ node, onContinue }: DataViewProps) {
  const [canContinue, setCanContinue] = useState(false);
  const content = String(node.data.content_html ?? node.data.html ?? '');
  const attachments = attachmentsFrom(node.data);
  const safeHtml = useMemo(
    () =>
      DOMPurify.sanitize(content, {
        ALLOWED_ATTR: ['src', 'alt', 'class', 'colspan', 'rowspan'],
        ALLOWED_TAGS: [
          'p',
          'strong',
          'em',
          'ul',
          'ol',
          'li',
          'br',
          'h3',
          'h4',
          'table',
          'tr',
          'td',
          'th',
          'thead',
          'tbody',
          'img',
        ],
        ALLOWED_URI_REGEXP: /^\/media\//,
      }),
    [content],
  );

  useEffect(() => {
    setCanContinue(false);
    const timer = window.setTimeout(() => setCanContinue(true), 1_000);
    return () => window.clearTimeout(timer);
  }, [node.id]);

  return (
    <article className="space-y-5">
      <div>
        <p className="text-sm font-medium text-royal">Информационный блок</p>
        <h2 className="text-2xl font-semibold text-fg">{node.title}</h2>
      </div>

      <div
        className="prose max-w-none rounded-lg border border-border bg-surface p-4 text-fg"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />

      {attachments.length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Материалы</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {attachments.map((attachment, index) => (
              <a
                className="focus-ring rounded-lg border border-border bg-bg p-3 text-sm text-royal hover:bg-surface"
                href={attachment.url ?? '#'}
                key={attachment.id ?? index}
              >
                {attachment.name ?? `Файл ${index + 1}`}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={onContinue}>
          Далее
        </Button>
      </div>
    </article>
  );
}
