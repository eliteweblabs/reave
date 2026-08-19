import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatPreviewResponse } from '../../lib/chatResponseRenderer';

type PreviewPayload = {
  html: string;
  title: string;
  orientation: 'portrait' | 'landscape';
};

function FileTextIcon({ size = 14 }: { size?: number }) {
  return (
    // IOS_ICONS.file-text — keep in sync with public/admin/admin-ui.js
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function DocumentPreviewLightbox({
  html,
  title,
  onClose,
}: {
  html: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="aui-chat-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <button
        type="button"
        className="aui-chat-lightbox-close"
        onClick={onClose}
        aria-label="Close document preview"
      >
        ×
      </button>
      <div
        className="aui-chat-lightbox-doc"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          className="aui-chat-lightbox-doc-frame"
          title={title}
          srcDoc={html}
          sandbox=""
        />
      </div>
    </div>,
    document.body,
  );
}

async function fetchDocumentPreview(preview: ChatPreviewResponse): Promise<PreviewPayload> {
  const params = new URLSearchParams();
  if (preview.contact_uid) params.set('contact_uid', preview.contact_uid);
  const qs = params.toString();
  const url = `/api/documents/${encodeURIComponent(preview.slug)}/preview${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as {
    html?: unknown;
    title?: unknown;
    orientation?: unknown;
    error?: unknown;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
  }
  if (typeof data.html !== 'string' || !data.html.trim()) {
    throw new Error('Preview was empty');
  }
  return {
    html: data.html,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : preview.title || preview.slug,
    orientation: data.orientation === 'landscape' || preview.orientation === 'landscape' ? 'landscape' : 'portrait',
  };
}

/** Thumbnail of a rendered document template; tap to review in a modal. */
export function ChatDocumentPreview({ preview }: { preview: ChatPreviewResponse }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPayload(null);
    fetchDocumentPreview(preview)
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview.slug, preview.contact_uid, preview.orientation, preview.title]);

  const title = payload?.title || preview.title || preview.slug;
  const orientation = payload?.orientation || preview.orientation || 'portrait';

  return (
    <>
      <button
        type="button"
        className={`aui-doc-thumb aui-doc-thumb--${orientation}`}
        onClick={() => payload && setOpen(true)}
        disabled={!payload}
        aria-label={`Preview ${title}`}
      >
        <span className="aui-doc-thumb-paper" aria-hidden="true">
          {payload ? (
            <span className="aui-doc-thumb-scale">
              <iframe title="" srcDoc={payload.html} sandbox="" tabIndex={-1} />
            </span>
          ) : (
            <span className={`aui-doc-thumb-placeholder${loading ? ' aui-doc-thumb-placeholder--loading' : ''}`}>
              <FileTextIcon size={22} />
            </span>
          )}
        </span>
        <span className="aui-doc-thumb-meta">
          <span className="aui-doc-thumb-title">{title}</span>
          <span className="aui-doc-thumb-hint">
            {error ? error : loading ? 'Rendering…' : 'Tap to review'}
          </span>
        </span>
      </button>
      {open && payload ? (
        <DocumentPreviewLightbox html={payload.html} title={title} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
