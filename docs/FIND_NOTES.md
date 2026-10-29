# Find and cell notes

These framework-neutral utilities are original OpenGrid code. They do not depend on a browser, mutate row fields, evaluate expressions, or implement the full AG Grid Find/Notes UI. The React adapter can use their immutable snapshots and subscriptions to provide navigation and an editor.

## Find

`createFindModel(grid, options?)` searches literal text in formatted cell values. Defaults are case-insensitive matching, visible columns only, and currently expanded data rows in visual order. Synthetic grouping headers are excluded; actual data rows in a tree remain searchable. A cell occurs once in the result even if the query appears multiple times in its text. Empty queries produce no results. This does not modify quick or column filters.

Options: `getRowIds?: () => string[]`, `includeHidden?: boolean`, `caseSensitive?: boolean`. A view callback can restrict results to the current page. After the callback's external state changes, call `refresh()`. Formatter and getter callbacks follow the grid's callback contract and must return without throwing.

The model exposes:

- `getSnapshot()` returns stable `{ query, matches, activeIndex }`; matches and positions are frozen. `activeIndex` is `-1` when there are no matches.
- `setQuery(text)` starts a changed query at its first match. Queries are limited to 10,000 JavaScript string characters.
- `next()` / `previous()` wrap, and `select(index)` selects a valid zero-based match. Each returns the active `{ rowId, columnId }`, or no value when navigation has no results. An invalid explicit index throws.
- `refresh()` recomputes results, preserving the active cell ID if it still matches; otherwise it chooses the first result.
- `subscribe(listener)` attaches to grid changes lazily. The grid listener detaches when the last observer leaves, avoiding discarded-controller listeners under React StrictMode.
- `dispose()` detaches listeners permanently. An unobserved model refreshes on the next snapshot access when the grid's state identity changed.

Repeated snapshot reads do not scan cells. Sorting, editing, filtering, transactions, hiding and pinning trigger recalculation when needed. Find currently has no regex, replace, occurrence offsets, server-wide search, or automatic focus/scroll API; an adapter uses returned stable cell positions to navigate.

## Cell notes

`new CellNotesStore(options?)` or `createCellNotesStore(options?)` creates an independent annotation store. `set(position, text)`, `get(position)` and `delete(position)` use stable `{ rowId, columnId }` identity. An empty string is a note; deletion is explicit. Delimiter-bearing and prototype-looking IDs do not collide because keys are serialized tuples in a private Map.

`getSnapshot()` returns frozen `{ version: 1, notes: [{ rowId, columnId, text }] }`. Old snapshots remain unchanged. `subscribe(listener)` notifies once per real mutation. Idempotent sets, imports, clears and unsuccessful deletes do not notify.

Defaults:

| Limit                | Value                               |
| -------------------- | ----------------------------------- |
| Notes                | 100,000                             |
| Text per note        | 10,000 JavaScript string characters |
| Row/column ID length | 1,024 characters                    |
| Serialized document  | 16,000,000 characters               |

Options are `maxNotes`, `maxTextLength`, `maxIdLength`, `maxSerializedLength`. Limits apply before mutation, including JSON escape overhead. This means a successful `exportJson()` result can be imported under the same limits.

`exportJson()` writes the version 1 document. `importJson(text)` replaces all notes atomically after checking schema, limits and unique cell IDs. Unknown versions/properties, invalid entries, duplicate IDs and malformed JSON reject the whole import. This is replacement, not merge. Order is insertion order, retained by round-trip. No file I/O or external storage is implicit.

`prune(validRows, validColumns)` removes notes whose row or column ID is absent and returns the removal count. This is explicit and potentially destructive. Sorting, filtering, hiding, changing pages or removing a grid row does not automatically delete notes. `clear()` deletes all notes.

Notes remain literal plain strings, including markup and formula-like text. The store does not interpret or sanitize them into HTML. UI adapters must render them as text (for example React string children or a textarea), never through `innerHTML`. There is no rich text, collaborative synchronization, author/timestamp metadata, import merge strategy, or row-edit undo integration in this store.

## Verification

`packages/core/src/find.test.ts` verifies literal/formatted matching, case/hidden options, navigation, active match retention, current-view callbacks, changes to the grid, immutable snapshots and lazy subscriptions. `packages/core/src/notes.test.ts` verifies stable identities, immutable snapshots, literal text, size/count limits, atomic versioned import, duplicate IDs, serialization accounting and explicit pruning.
