const TOOL_LABELS: Record<string, string> = {
  fetch_url: 'Fetching website',
  lighthouse_audit: 'Running Lighthouse audit',
  ssl_check: 'Checking SSL certificate',
  check_links: 'Checking links',
  dns_check: 'Checking DNS',
  resolve_contact: 'Looking up client',
  list_contacts: 'Listing clients',
  create_contact: 'Creating client',
  update_contact: 'Updating client',
  delete_contact: 'Deleting client',
  list_work: 'Listing projects',
  read_work: 'Reading project',
  create_work: 'Creating project',
  update_work: 'Updating project',
  delete_work: 'Deleting project',
  link_to_work: 'Linking to project',
  toggle_work_item: 'Updating checklist',
  get_work_invoice_suggestions: 'Preparing invoice suggestions',
  list_knowledge: 'Searching knowledge base',
  read_knowledge: 'Reading knowledge base',
  search_knowledge: 'Searching knowledge base',
  write_knowledge: 'Saving to knowledge base',
  read_email_inbox: 'Reading email',
  list_email_inbox: 'Searching inbox',
  mark_email_junk: 'Marking email as junk',
  mark_email_receipt: 'Filing receipt',
  mark_email_routed: 'Routing email',
  delete_email: 'Deleting email',
  create_email_filter_rule: 'Creating email filter',
  send_email: 'Sending email',
  list_todos: 'Listing to-dos',
  create_todo: 'Creating to-do',
  update_todo: 'Updating to-do',
  mark_todo_done: 'Completing to-do',
  delete_todo: 'Deleting to-do',
  run_dev_task: 'Running dev task',
  list_railway_domains: 'Checking Railway domains',
  sync_resend_dns: 'Syncing email DNS',
  get_git_status: 'Checking git status',
  get_recent_commits: 'Reading recent commits',
  check_deployment_status: 'Checking deployment',
  list_open_branches: 'Listing branches',
  run_terminal_command: 'Running command',
  create_github_branch: 'Creating branch',
  write_github_file: 'Writing file',
  create_pull_request: 'Creating pull request',
  list_kinsta_sites: 'Listing Kinsta sites',
  create_kinsta_site: 'Creating Kinsta site',
  delete_kinsta_site: 'Deleting Kinsta site',
  backup_kinsta_site: 'Backing up site',
  clear_kinsta_cache: 'Clearing cache',
  get_kinsta_operation: 'Checking Kinsta operation',
  list_bookings: 'Listing bookings',
  get_booking: 'Reading booking',
  get_booking_link: 'Getting booking link',
  sync_vapi_assistant: 'Syncing Vapi assistant',
  set_client_portal: 'Configuring client portal',
  get_client_portal: 'Reading client portal',
  get_client_submit_link: 'Getting submit link',
  send_client_portal: 'Sending client portal',
  get_site_monitoring: 'Reading site monitoring',
  set_site_monitoring: 'Updating site monitoring',
  recheck_site_monitoring: 'Rechecking site monitoring',
};

function titleCaseWords(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function labelForAgentTool(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Working';
  return TOOL_LABELS[trimmed] ?? titleCaseWords(trimmed);
}
