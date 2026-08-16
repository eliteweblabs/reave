import type { FocusEvent, KeyboardEvent, RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useAuiState, useComposerRuntime } from '@assistant-ui/react';
import {
  getMentionEditorCaret,
  mentionEditorHasRawTokens,
  renderMentionEditor,
  serializeMentionEditor,
  setMentionEditorCaret,
  syncMentionEditorEmpty,
  type ComposerFieldHandle,
} from '../../lib/composerMentionEditor';

export type { ComposerFieldHandle };

type ComposerMentionInputProps = {
  handleRef: RefObject<ComposerFieldHandle | null>;
  className?: string;
  placeholder?: string;
  enterKeyHint?: 'enter' | 'send';
  onFocus: () => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
  onInput: (value: string, caret: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
};

export function ComposerMentionInput({
  handleRef,
  className,
  placeholder,
  enterKeyHint,
  onFocus,
  onBlur,
  onInput,
  onKeyDown,
}: ComposerMentionInputProps) {
  const composer = useComposerRuntime();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSerializedRef = useRef('');
  const caretRef = useRef(0);
  const composingRef = useRef(false);
  const composerText = useAuiState((s) => s.composer.text ?? '');

  const applyHandle = useCallback(
    (el: HTMLDivElement | null) => {
      editorRef.current = el;
      if (!el) {
        handleRef.current = null;
        return;
      }
      handleRef.current = {
        focus: () => {
          try {
            el.focus({ preventScroll: true });
          } catch {
            el.focus();
          }
        },
        getValue: () => serializeMentionEditor(el),
        getCaret: () => getMentionEditorCaret(el),
        setCaret: (offset) => setMentionEditorCaret(el, offset),
        getElement: () => el,
      };
    },
    [handleRef],
  );

  const commit = useCallback(
    (el: HTMLDivElement) => {
      const caret = getMentionEditorCaret(el);
      caretRef.current = caret;
      let text = serializeMentionEditor(el);
      if (mentionEditorHasRawTokens(el)) {
        renderMentionEditor(el, text);
        setMentionEditorCaret(el, caret);
        text = serializeMentionEditor(el);
      }
      lastSerializedRef.current = text;
      syncMentionEditorEmpty(el, text);
      if ((composer.getState().text ?? '') !== text) composer.setText(text);
      onInput(text, caret);
    },
    [composer, onInput],
  );

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || composingRef.current) return;
    const current = serializeMentionEditor(el);
    if (current === composerText && !mentionEditorHasRawTokens(el)) {
      lastSerializedRef.current = composerText;
      syncMentionEditorEmpty(el, composerText);
      return;
    }
    const hadFocus = document.activeElement === el;
    const caret = hadFocus
      ? current === composerText
        ? getMentionEditorCaret(el)
        : caretRef.current
      : composerText.length;
    renderMentionEditor(el, composerText);
    lastSerializedRef.current = composerText;
    syncMentionEditorEmpty(el, composerText);
    if (hadFocus) setMentionEditorCaret(el, Math.min(caret, composerText.length));
  }, [composerText]);

  return (
    <div
      ref={applyHandle}
      className={className}
      role="textbox"
      aria-multiline="true"
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      data-empty="1"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      {...(enterKeyHint ? { enterKeyHint } : {})}
      onFocus={onFocus}
      onBlur={onBlur}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        commit(e.currentTarget);
      }}
      onInput={(e) => {
        if (composingRef.current) return;
        commit(e.currentTarget);
      }}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        const data = e.clipboardData;
        if (!data) return;
        const files = Array.from(data.files ?? []);
        const text = data.getData('text/plain');
        if (!files.length && !text) return;
        e.preventDefault();
        for (const file of files) void composer.addAttachment(file);
        if (text) document.execCommand('insertText', false, text);
      }}
    />
  );
}
