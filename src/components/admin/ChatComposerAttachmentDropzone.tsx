import { composeEventHandlers } from '@radix-ui/primitive';
import {
  forwardRef,
  useCallback,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { useComposerRuntime } from '@assistant-ui/react';
import { queueComposerAttachments } from '../../lib/chatComposerAttachments';

export type ChatComposerAttachmentDropzoneProps = HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
  children?: ReactNode;
};

export const ChatComposerAttachmentDropzone = forwardRef<HTMLDivElement, ChatComposerAttachmentDropzoneProps>(
  ({ disabled, children, ...rest }, ref) => {
    const composer = useComposerRuntime();
    const [isDragging, setIsDragging] = useState(false);

    const handleDragEnterCapture = useCallback(
      (e: DragEvent) => {
        if (disabled) return;
        e.preventDefault();
        setIsDragging(true);
      },
      [disabled],
    );

    const handleDragOverCapture = useCallback(
      (e: DragEvent) => {
        if (disabled) return;
        e.preventDefault();
        setIsDragging((prev) => (prev ? prev : true));
      },
      [disabled],
    );

    const handleDragLeaveCapture = useCallback(
      (e: DragEvent) => {
        if (disabled) return;
        e.preventDefault();
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setIsDragging(false);
      },
      [disabled],
    );

    const handleDrop = useCallback(
      (e: DragEvent) => {
        if (disabled) return;
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) {
          void queueComposerAttachments((file) => composer.addAttachment(file), files);
        }
      },
      [composer, disabled],
    );

    return (
      <div
        {...rest}
        {...(isDragging ? { 'data-dragging': 'true' } : null)}
        ref={ref}
        onDragEnterCapture={composeEventHandlers(rest.onDragEnterCapture, handleDragEnterCapture)}
        onDragOverCapture={composeEventHandlers(rest.onDragOverCapture, handleDragOverCapture)}
        onDragLeaveCapture={composeEventHandlers(rest.onDragLeaveCapture, handleDragLeaveCapture)}
        onDropCapture={composeEventHandlers(rest.onDropCapture, handleDrop)}
      >
        {children}
      </div>
    );
  },
);

ChatComposerAttachmentDropzone.displayName = 'ChatComposerAttachmentDropzone';
