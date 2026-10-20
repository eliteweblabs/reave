import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useCallback } from 'react';
import { useAuiState, useComposerRuntime } from '@assistant-ui/react';
import { chatFileInputAccept, queueComposerAttachments } from '../../lib/chatComposerAttachments';

type ChatComposerAddAttachmentProps = ComponentPropsWithoutRef<'button'> & {
  children?: ReactNode;
};

export function ChatComposerAddAttachment({
  children,
  className,
  disabled: disabledProp,
  ...rest
}: ChatComposerAddAttachmentProps) {
  const composer = useComposerRuntime();
  const editing = useAuiState((s) => s.composer.isEditing);
  const attachmentAccept = useAuiState((s) => s.composer.attachmentAccept);
  const disabled = disabledProp || !editing;

  const openPicker = useCallback(() => {
    if (disabled) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;

    const accept = chatFileInputAccept(attachmentAccept);
    if (accept && accept !== '*') {
      input.accept = accept;
    }

    document.body.appendChild(input);

    input.onchange = (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (fileList?.length) {
        void queueComposerAttachments((file) => composer.addAttachment(file), fileList);
      }
      document.body.removeChild(input);
    };

    input.oncancel = () => {
      if (!input.files?.length) {
        document.body.removeChild(input);
      }
    };

    input.click();
  }, [attachmentAccept, composer, disabled]);

  return (
    <button type="button" className={className} disabled={disabled} onClick={openPicker} {...rest}>
      {children}
    </button>
  );
}
