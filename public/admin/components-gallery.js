/**
 * /admin/components — living gallery of shared admin UI primitives.
 * Source of truth: public/admin/admin-ui.js + pane-header.js (+ os-dialog, admin-notice).
 */

import {
  IOS_ICONS,
  iosIcon,
  createIosIconBtn,
  createAgentBtn,
  createPanelBackBtn,
  createFabNewBtn,
  paneDeleteIcon,
  paneShareIcon,
  createCopyIconBtn,
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
} from './admin-ui.js?v=20260811a';
import { createPaneHeader } from './pane-header.js?v=20260808d';
import { osAlert, osConfirm } from './os-dialog.js?v=20260728j';
import { buildAdminNotice, appendAdminNoticeAction } from './admin-notice.js';

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
    'Canonical header actions via <code>paneDeleteIcon</code>, <code>paneShareIcon</code>, <code>createCopyIconBtn</code>, <code>createIosIconBtn</code>, <code>createAgentBtn</code>, <code>createPanelBackBtn</code>. Tap trash once → confirm (must stay <strong>red</strong>, never white).',
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
    'FAB + text buttons',
    '<code>createFabNewBtn</code> and <code>de-btn*</code> variants (<code>setDeBtnLabel</code> for icon+label).',
    (el) => {
      const r = row(el);
      const setStatus = statusLine(el);
      r.appendChild(createFabNewBtn('New item', () => setStatus('New')));
      r.appendChild(deBtn('Primary', 'primary'));
      r.appendChild(deBtn('Secondary', 'secondary'));
      r.appendChild(deBtn('Ghost', 'ghost'));
      r.appendChild(deBtn('Danger', 'danger'));
      r.appendChild(deBtn('Save', 'primary', 'check'));
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
        cell.className = 'cg-icon-cell';
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
        tone: 'info',
        copyHtml: '<strong>Admin notice</strong><p>buildAdminNotice + appendAdminNoticeAction</p>',
        onDismiss: (btn) => {
          btn.closest('.admin-setup-alert')?.remove();
          setStatus('Notice dismissed');
        },
      });
      const toolbar = document.createElement('div');
      toolbar.className = 'admin-setup-alert-toolbar';
      toolbar.dataset.actionCount = '1';
      appendAdminNoticeAction(toolbar, {
        label: 'Action',
        primary: true,
        onClick: () => setStatus('Notice action'),
      });
      notice.insertBefore(toolbar, notice.querySelector('.admin-setup-alert-dismiss'));
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
