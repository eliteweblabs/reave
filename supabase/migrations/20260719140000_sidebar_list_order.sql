-- Manual sidebar list order for chats, projects, knowledge, and clients.
CREATE TABLE IF NOT EXISTS sidebar_list_order (
  list_name  VARCHAR(32) NOT NULL,
  item_key   VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (list_name, item_key)
);

CREATE INDEX IF NOT EXISTS idx_sidebar_list_order ON sidebar_list_order (list_name, sort_order ASC);
