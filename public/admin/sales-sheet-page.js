import {
  initSidebarLayout,
  syncAdminSplitView,
  ADMIN_SPLIT_VIEW_MQ,
} from './admin-ui.js?v=20260820a';

initSidebarLayout();
const sync = () => syncAdminSplitView('sales-sheet');
sync();
ADMIN_SPLIT_VIEW_MQ.addEventListener('change', sync);

const FOOTER_TABS = {
  dashboard: 'dashboard',
  chat: 'chats',
  inbox: 'email',
  schedule: 'schedule',
  work: 'work',
  todo: 'todo',
  clients: 'clients',
};

document.querySelectorAll('.footer-nav-btn[data-nav]').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    const tab = FOOTER_TABS[btn.getAttribute('data-nav') || ''];
    if (!tab) return;
    event.preventDefault();
    location.assign(`/admin/?tab=${tab}`);
  });
});
