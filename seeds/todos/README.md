# Todo seeds

One-time bootstrap checklists for an **empty** `todos` table on reave.app. Loaded by `pgTodos.dbSeedTodosFromMarkdownIfEmpty()` once, then marked done in `todos_meta.markdown_seed_done`.

Client installs run `dbPurgeBundledMarkdownTodosOnce()` to drop these sections after first boot.

This is **not** live company to-do data — owners manage to-dos in Admin → To-do (Postgres).
