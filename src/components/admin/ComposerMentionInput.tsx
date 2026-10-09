import type { FocusEvent, KeyboardEvent, RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useAuiState, useComposerRuntime } from '@assistant-ui/react';
import {
  armReaveChatComposing,
  isSentComposerEcho,
  isVoiceOrDictationInputType,
} from '../../lib/chatComposerDraft';
import {
  getMentionEditorCaret,
  mentionEditorHasRawTokens,
  renderMentionEditor,
  serializeMentionEditor,
  setMentionEditorCaret,
  syncComposerFieldHeight,
  syncMentionEditorEmpty,
  type ComposerFieldHandle,
} from '../../lib/composerMentionEditor';

function lastUserMessagePlainText(
  messages: ReadonlyArray<{ role: string; content?: ReadonlyArray<{ type: string; text?: string }> }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'user') continue;
    return (messages[i]?.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
  }
  return '';
}

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
  const lastUserText = useAuiState((s) => lastUserMessagePlainText(s.thread.messages));

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
      syncComposerFieldHeight(el);
      if ((composer.getState().text ?? '') !== text) composer.setText(text);
      onInput(text, caret);
    },
    [composer, onInput],
  );

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (el) syncComposerFieldHeight(el);
  }, []);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || composingRef.current) return;
    const current = serializeMentionEditor(el);
    const hadFocus = document.activeElement === el;
    // Dictation / IME often updates the DOM before assistant-ui composer state —
    // pushing empty state down would wipe the in-progress utterance.
    if (hadFocus && current.trim() && current !== composerText) {
      if (!composerText.trim() && isSentComposerEcho(current, lastUserText)) {
        renderMentionEditor(el, '');
        lastSerializedRef.current = '';
        syncMentionEditorEmpty(el, '');
        return;
      }
      if ((composer.getState().text ?? '') !== current) composer.setText(current);
      lastSerializedRef.current = current;
      syncMentionEditorEmpty(el, current);
      syncComposerFieldHeight(el);
      return;
    }
    if (current === composerText && !mentionEditorHasRawTokens(el)) {
      lastSerializedRef.current = composerText;
      syncMentionEditorEmpty(el, composerText);
      syncComposerFieldHeight(el);
      return;
    }
    const caret = hadFocus
      ? current === composerText
        ? getMentionEditorCaret(el)
        : caretRef.current
      : composerText.length;
    renderMentionEditor(el, composerText);
    lastSerializedRef.current = composerText;
    syncMentionEditorEmpty(el, composerText);
    syncComposerFieldHeight(el);
    if (hadFocus) setMentionEditorCaret(el, Math.min(caret, composerText.length));
  }, [composer, composerText, lastUserText]);

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
      onFocus={() => {
        try {
          window.dispatchEvent(new CustomEvent('reave:chat-compose-active', { detail: true }));
        } catch {
          /* ignore */
        }
        onFocus();
      }}
      onBlur={onBlur}
      onBeforeInput={(e) => {
        const type = e.nativeEvent.inputType || '';
        if (isVoiceOrDictationInputType(type)) armReaveChatComposing();
      }}
      onCompositionStart={() => {
        composingRef.current = true;
        armReaveChatComposing();
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        armReaveChatComposing();
        commit(e.currentTarget);
      }}
      onInput={(e) => {
        armReaveChatComposing();
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
