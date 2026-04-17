# Strategy Workspace Manual Checklist

Use this checklist when validating `/strategies` without an end-to-end harness.

## CRUD

- Open `/strategies` with existing records and confirm the library, dossier, and action rail all render.
- Create a new strategy from the header or rail and confirm the inline editor opens without leaving the page.
- Save a new strategy and confirm it appears in the library and becomes the selected dossier.
- Edit an existing strategy and confirm the saved changes reappear in the dossier after save.
- Duplicate an existing strategy, confirm the new draft requires a new name, then save it as a separate record.
- Delete a strategy through the destructive confirmation dialog and confirm it disappears from the library.

## Workflow Safety

- Make a draft change and click `Cancel`; confirm the discard prompt appears.
- Reject the discard prompt and confirm the editor stays open with the unsaved change intact.
- Re-open delete on a selected strategy and confirm the dialog names the exact strategy before deletion.
- Launch the backtest dialog from the rail and confirm the selected strategy name is shown in the dialog copy.

## Responsive + Keyboard

- Verify the library, dossier, and editor stack cleanly on tablet and mobile widths.
- Tab to `Create Strategy`, activate it with the keyboard, and confirm the editor opens.
- Tab through delete confirmation controls and confirm the dialog remains keyboard reachable.
