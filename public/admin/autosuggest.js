/**
 * Shared arrow-key navigation for autosuggest dropdowns.
 */

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} dropdown
 * @param {{ optionSelector?: string, onClose?: () => void, isOpen?: () => boolean }} [options]
 */
export function attachAutosuggestKeyboardNav(input, dropdown, options = {}) {
  if (!input || !dropdown) return () => {};
  const optionSelector = options.optionSelector || 'button';
  const onClose = typeof options.onClose === 'function' ? options.onClose : null;

  function isOpen() {
    if (typeof options.isOpen === 'function') return options.isOpen();
    return dropdown.style.display !== 'none';
  }
  function getOptions() {
    return [...dropdown.querySelectorAll(optionSelector)].filter((el) => !el.disabled);
  }
  function setActive(opts, idx) {
    opts.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0) opts[idx]?.scrollIntoView({ block: 'nearest' });
  }
  const onKeyDown = (ev) => {
    if (!isOpen()) return;
    const opts = getOptions();
    if (!opts.length) return;
    const currentIdx = opts.findIndex((el) => el.classList.contains('active'));
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive(opts, currentIdx < 0 ? 0 : (currentIdx + 1) % opts.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive(opts, currentIdx <= 0 ? opts.length - 1 : currentIdx - 1);
    } else if (ev.key === 'Enter') {
      if (currentIdx >= 0) {
        ev.preventDefault();
        opts[currentIdx].click();
      }
    } else if (ev.key === 'Escape') {
      if (onClose) {
        ev.preventDefault();
        onClose();
      }
    }
  };
  input.addEventListener('keydown', onKeyDown);
  return () => input.removeEventListener('keydown', onKeyDown);
}
