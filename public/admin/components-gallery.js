/**
 * /admin/components — living gallery of shared admin UI primitives.
 * Source of truth: public/admin/admin-ui.js + pane-header.js (+ os-dialog, admin-notice).
 */

import {
  IOS_ICONS,
  iosIcon,
  createIosIconBtn,
  createBrandBtn,
  createAgentBtn,
  createPanelBackBtn,
  createFabNewBtn,
  paneDeleteIcon,
  paneShareIcon,
  createTimingRing,
  restartTimingRing,
  createCopyIconBtn,
  createOverflowMenuBtn,
  IOS_ICON_BTN_SIZES,
  createSlidingPillSelect,
  createListEmptyState,
  createCenteredListEmpty,
  createPanePlaceholder,
  createEditableHeaderTitleInput,
  listSearchAddNew,
  createSwipeRow,
  swipeDeleteAction,
  swipeArchiveAction,
  swipeAgentAction,
  deBtnIconSvg,
  setDeBtnLabel,
  initTextareaCopyButtons,
} from './admin-ui.js?v=20260829a';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { osAlert, osConfirm } from './os-dialog.js?v=20260826a';
import { buildAdminNotice, appendAdminNoticeAction } from './admin-notice.js?v=20260828a';

function section(root, title, hint, build) {
  const el = document.createElement('section');
  el.className = 'cg-section';
  const h = document.createElement('h2');
  h.textContent = title;
  el.appendChild(h);
  if (hint) {
    const p = document.createElement('p');
    p.className = 'cg-hint';
    p.innerHTML = hint;
    el.appendChild(p);
  }
  build(el);
  root.appendChild(el);
  return el;
}

function row(parent, label) {
  const wrap = document.createElement('div');
  wrap.className = 'cg-row';
  if (label) {
    const lab = document.createElement('div');
    lab.className = 'cg-label';
    lab.textContent = label;
    wrap.appendChild(lab);
  }
  parent.appendChild(wrap);
  return wrap;
}

function statusLine(parent) {
  const p = document.createElement('p');
  p.className = 'cg-status';
  p.textContent = ' ';
  parent.appendChild(p);
  return (msg, tone = '') => {
    p.textContent = msg || ' ';
    if (tone) p.dataset.tone = tone;
    else delete p.dataset.tone;
  };
}

function deBtn(label, variant, iconKey) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `de-btn de-btn-${variant}${iconKey ? ' de-btn-with-icon' : ''}`;
  if (iconKey) setDeBtnLabel(btn, label, iconKey);
  else btn.textContent = label;
  return btn;
}

function mount() {
  const root = document.getElementById('components-gallery');
  if (!root) return;

  section(
    root,
    'Pane header toolbar',
    'Canonical header actions via <code>paneDeleteIcon</code>, <code>paneShareIcon</code>, <code>createCopyIconBtn</code>, <code>createOverflowMenuBtn</code>, <code>createIosIconBtn</code>, <code>createAgentBtn</code>, <code>createPanelBackBtn</code>. Detail panes fold secondary header actions (Copy / Share / Archive / Delete) into ⋯ — Agent and primary tools stay visible. Tap trash once → confirm (must stay <strong>red</strong>, never white).',
    (el) => {
      const setStatus = statusLine(el);
      const toolbar = document.createElement('div');
      toolbar.className = 'cg-row cg-row--toolbar de-header-actions';

      toolbar.appendChild(
        createPanelBackBtn({
          label: 'Back',
          onClick: () => setStatus('Back'),
        }),
      );
      toolbar.appendChild(
        createOverflowMenuBtn({
          label: 'Session actions',
          getItems: () => [
            { label: 'Copy', iconKey: 'copy', action: () => setStatus('Copied', 'ok') },
            { label: 'Share', iconKey: 'share', action: () => setStatus('Share') },
            { label: 'Archive', iconKey: 'archive', action: () => setStatus('Archived') },
            {
              label: 'Delete',
              iconKey: 'trash',
              danger: true,
              confirmDelete: true,
              action: () => setStatus('Deleted (confirmed)', 'warn'),
            },
          ],
        }),
      );
      toolbar.appendChild(
        createCopyIconBtn({
          label: 'Copy',
          getText: () => 'Gallery copy demo',
          onSuccess: () => setStatus('Copied', 'ok'),
        }),
      );
      toolbar.appendChild(
        createIosIconBtn({
          iconKey: 'archive',
          label: 'Archive',
          className: 'ios-icon-btn ch-archive-chat-btn',
          onClick: () => setStatus('Archived'),
        }),
      );
      toolbar.appendChild(
        paneShareIcon({
          label: 'Share',
          onClick: () => setStatus('Share'),
        }),
      );
      toolbar.appendChild(
        paneDeleteIcon({
          label: 'Delete',
          onClick: () => setStatus('Deleted (confirmed)', 'warn'),
        }),
      );
      toolbar.appendChild(
        createAgentBtn({
          label: 'Agent',
          onClick: () => setStatus('Agent'),
        }),
      );
      el.insertBefore(toolbar, el.querySelector('.cg-status'));
    },
  );

  section(
    root,
    'Icon button sizes',
    'Every icon control takes <code>size: \'sm\' | \'md\' | \'lg\'</code> — that class locks the box and glyph (<code>24/12</code>, <code>36/16</code>, <code>44/20</code>). Default is <code>md</code>, the same box as <code>createAgentBtn</code>.',
    (el) => {
      const setStatus = statusLine(el);
      for (const size of /** @type {const} */ (['sm', 'md', 'lg'])) {
        const r = row(el, `${size} · ${IOS_ICON_BTN_SIZES[size].box}×${IOS_ICON_BTN_SIZES[size].box}`);
        r.classList.add('cg-row--toolbar', 'de-header-actions');
        r.appendChild(
          createIosIconBtn({
            iconKey: 'archive',
            label: `Archive ${size}`,
            size,
            onClick: () => setStatus(`Archive ${size}`),
          }),
        );
        r.appendChild(paneDeleteIcon({ label: `Delete ${size}`, size, onClick: () => setStatus(`Delete ${size}`, 'warn') }));
        r.appendChild(createAgentBtn({ label: `Agent ${size}`, size, onClick: () => setStatus(`Agent ${size}`) }));
      }
    },
  );

  section(
    root,
    'Timing ring',
    'Sealed <code>createTimingRing</code> — stopwatch and countdown share one SVG center inside a shadow root so parent toast/toolbar CSS cannot steal the countdown. Undo toast and armed <code>paneDeleteIcon</code> both use this. Tap the pill to restart.',
    (el) => {
      const r = row(el);
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'ch-undo-toast ch-toast-visible cg-undo-pill';
      pill.setAttribute('aria-label', 'Undo');
      const ring = createTimingRing({ size: 20, durationMs: 5000, autoplay: false });
      const label = document.createElement('span');
      label.className = 'ch-undo-label';
      label.textContent = 'Undo';
      pill.append(ring, label);
      pill.addEventListener('click', () => restartTimingRing(ring));
      r.appendChild(pill);
      restartTimingRing(ring);
    },
  );

  section(
    root,
    'Textarea copy button',
    'Every admin textarea gets a corner copy control from <code>initTextareaCopyButtons</code> — it appears once the field has text. Opt a field out with <code>data-copy-button="off"</code>; send composers are already excluded.',
    (el) => {
      const field = document.createElement('label');
      field.className = 'prof-field';
      field.innerHTML =
        '<span class="prof-label">Paste something</span>' +
        '<textarea class="prof-svg-input" rows="4">&lt;svg viewBox="0 0 24 24"&gt;…&lt;/svg&gt;</textarea>' +
        '<span class="prof-hint">Copy sits over the field, clear of the scrollbar gutter.</span>';
      el.appendChild(field);

      const optOut = document.createElement('label');
      optOut.className = 'prof-field';
      optOut.style.marginTop = '0.75rem';
      optOut.innerHTML =
        '<span class="prof-label">Opted out</span>' +
        '<textarea rows="2" data-copy-button="off">No copy button here.</textarea>';
      el.appendChild(optOut);
    },
  );

  section(
    root,
    'Official buttons',
    'Text CTAs go through <code>createBrandBtn</code> — filled, solid, glass, danger. Two actions in one pill use <code>brand-btn-pair</code> (primary + secondary). Circle chrome is <code>createFabNewBtn</code> / <code>createIosIconBtn</code>. Legacy <code>de-btn*</code> classes alias the same pills.',
    (el) => {
      const r = row(el);
      const setStatus = statusLine(el);
      r.appendChild(createFabNewBtn('New item', () => setStatus('New')));
      r.appendChild(createBrandBtn({ label: 'Filled', onClick: () => setStatus('Filled') }));
      r.appendChild(createBrandBtn({ variant: 'solid', label: 'Solid', onClick: () => setStatus('Solid') }));
      r.appendChild(createBrandBtn({ variant: 'glass', label: 'Glass', onClick: () => setStatus('Glass') }));
      r.appendChild(createBrandBtn({ variant: 'danger', label: 'Danger', onClick: () => setStatus('Danger', 'warn') }));
      r.appendChild(createBrandBtn({ variant: 'filled', label: 'Save', iconKey: 'check', onClick: () => setStatus('Save') }));
      const pair = document.createElement('div');
      pair.className = 'brand-btn-pair';
      pair.appendChild(createBrandBtn({ label: 'Primary', onClick: () => setStatus('Pair primary') }));
      pair.appendChild(createBrandBtn({ variant: 'glass', label: 'Secondary', onClick: () => setStatus('Pair secondary') }));
      r.appendChild(pair);
      r.appendChild(deBtn('Legacy de-btn', 'secondary'));
      r.querySelectorAll('.de-btn').forEach((btn) => {
        btn.addEventListener('click', () => setStatus(btn.textContent.trim() || 'Clicked'));
      });
    },
  );

  section(
    root,
    'IOS_ICONS pack',
    'Every key in <code>IOS_ICONS</code> / <code>iosIcon(key)</code>. Add glyphs here first — never one-off SVGs in panels.',
    (el) => {
      const grid = document.createElement('div');
      grid.className = 'cg-icon-grid';
      for (const key of Object.keys(IOS_ICONS)) {
        const cell = document.createElement('div');
        cell.className = key === 'trash' ? 'cg-icon-cell cg-icon-cell--danger' : 'cg-icon-cell';
        cell.innerHTML = iosIcon(key, 20);
        const cap = document.createElement('span');
        cap.textContent = key;
        cell.appendChild(cap);
        grid.appendChild(cell);
      }
      el.appendChild(grid);
    },
  );

  section(
    root,
    'Sliding pill + search subheader',
    '<code>createSlidingPillSelect</code> and <code>listSearchAddNew</code>.',
    (el) => {
      const setStatus = statusLine(el);
      const pill = createSlidingPillSelect({
        value: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
        ],
        onChange: (v) => setStatus(`Pill: ${v}`),
      });
      pill.el.style.maxWidth = '320px';
      el.insertBefore(pill.el, el.querySelector('.cg-status'));

      const search = listSearchAddNew({
        search: {
          placeholder: 'Search…',
          onInput: (q) => setStatus(q ? `Search: ${q}` : ' '),
        },
        addNew: {
          label: 'New',
          onClick: () => setStatus('Add from search'),
        },
      });
      if (search?.el) {
        search.el.style.marginTop = '0.75rem';
        el.insertBefore(search.el, el.querySelector('.cg-status'));
      }
    },
  );

  section(
    root,
    'Headers + empty states',
    '<code>createPaneHeader</code> (pane-header.js), <code>createEditableHeaderTitleInput</code>, empty/placeholder helpers.',
    (el) => {
      const setStatus = statusLine(el);
      const headerHost = document.createElement('div');
      headerHost.style.border = '1px solid var(--panel-border)';
      headerHost.style.borderRadius = '10px';
      headerHost.style.overflow = 'hidden';
      headerHost.style.marginBottom = '0.75rem';
      el.insertBefore(headerHost, el.querySelector('.cg-status'));

      const editable = createEditableHeaderTitleInput({
        value: 'Editable title',
        placeholder: 'Title',
      });
      editable.input.addEventListener('change', () => setStatus(`Title: ${editable.input.value}`));

      const secondary = document.createElement('p');
      secondary.className = 'schedule-detail-when';
      secondary.style.cssText = 'margin:0;padding:0.35rem;text-align:center;font-size:0.88rem;font-weight:600;border-bottom:1px solid var(--panel-border)';
      secondary.textContent = 'Optional secondary row';

      headerHost.appendChild(
        createPaneHeader({
          back: { label: 'Back', onClick: () => setStatus('Header back') },
          titleNode: editable.el,
          icons: [
            paneShareIcon({ label: 'Share', onClick: () => setStatus('Header share') }),
            paneDeleteIcon({ label: 'Delete', onClick: () => setStatus('Header delete', 'warn') }),
          ],
          secondary,
        }).root,
      );

      headerHost.appendChild(
        createPaneHeader({
          title: 'Title only',
          icons: [createFabNewBtn('New', () => setStatus('Header new'))],
        }).root,
      );

      const empties = document.createElement('div');
      empties.className = 'cg-row';
      empties.style.alignItems = 'stretch';
      empties.appendChild(createListEmptyState({ text: 'Nothing here yet.' }));
      empties.appendChild(createCenteredListEmpty({ text: 'Centered empty state' }));
      empties.appendChild(
        createPanePlaceholder({
          innerHtml: '<p>Pick something from the list</p>',
          onCreate: () => setStatus('Placeholder create'),
        }),
      );
      el.insertBefore(empties, el.querySelector('.cg-status'));
    },
  );

  section(
    root,
    'Swipe row actions',
    '<code>createSwipeRow</code> + <code>swipeDeleteAction</code> / archive / agent. Swipe delete keeps a white icon on the red fill (correct).',
    (el) => {
      const setStatus = statusLine(el);
      const list = document.createElement('div');
      list.className = 'cg-demo-list';
      const content = document.createElement('button');
      content.type = 'button';
      content.className = 'ch-list-item';
      content.style.cssText =
        'display:block;width:100%;text-align:left;padding:0.85rem 1rem;border:none;background:var(--card);color:var(--fg);font:inherit;cursor:pointer;';
      content.textContent = 'Swipe left for actions';
      list.appendChild(
        createSwipeRow(content, [
          swipeAgentAction(() => setStatus('Swipe agent')),
          swipeArchiveAction({ onClick: () => setStatus('Swipe archive') }),
          swipeDeleteAction({
            onClick: () => setStatus('Swipe deleted', 'warn'),
          }),
        ]),
      );
      el.insertBefore(list, el.querySelector('.cg-status'));
    },
  );

  section(
    root,
    'Dialogs + notices',
    '<code>osAlert</code> / <code>osConfirm</code> and <code>buildAdminNotice</code>.',
    (el) => {
      const r = row(el);
      const setStatus = statusLine(el);
      const alertBtn = deBtn('osAlert', 'secondary');
      alertBtn.addEventListener('click', () => {
        void osAlert({
          title: 'Alert',
          bodyHtml: '<p>Shared osAlert dialog.</p>',
        }).then(() => setStatus('Alert dismissed'));
      });
      const confirmBtn = deBtn('osConfirm', 'secondary');
      confirmBtn.addEventListener('click', () => {
        void osConfirm({
          title: 'Confirm',
          bodyHtml: '<p>Shared osConfirm dialog.</p>',
          confirmLabel: 'OK',
        }).then((ok) => setStatus(ok ? 'Confirmed' : 'Cancelled', ok ? 'ok' : ''));
      });
      r.appendChild(alertBtn);
      r.appendChild(confirmBtn);

      const noticeHost = document.createElement('div');
      noticeHost.style.marginTop = '0.75rem';
      el.insertBefore(noticeHost, el.querySelector('.cg-status'));
      const notice = buildAdminNotice({
        tone: 'alert',
        copyHtml: '<strong>Admin notice</strong><p>buildAdminNotice + appendAdminNoticeAction</p>',
        actions: [
          {
            label: 'View',
            iconKey: 'eye',
            title: 'View',
            onClick: () => setStatus('Notice view'),
          },
          {
            label: 'Archive',
            iconKey: 'archive',
            title: 'Archive',
            onClick: () => setStatus('Notice archive'),
          },
        ],
        onDismiss: (btn) => {
          btn.closest('.admin-setup-alert')?.remove();
          setStatus('Notice dismissed');
        },
      });
      noticeHost.appendChild(notice);
    },
  );

  section(
    root,
    'deBtnIconSvg helper',
    'Inline icon helper used by labeled <code>de-btn</code>s.',
    (el) => {
      const r = row(el);
      const sample = document.createElement('span');
      sample.style.display = 'inline-flex';
      sample.style.alignItems = 'center';
      sample.style.gap = '0.35rem';
      sample.style.color = 'var(--fg)';
      sample.innerHTML = `${deBtnIconSvg('paperclip', 16)} Attachment`;
      r.appendChild(sample);
    },
  );

  initTextareaCopyButtons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
