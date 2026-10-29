# Touch interaction

Touch behavior is implemented in the React client grid, with native browser scrolling and explicit editing/range controls. It is independent of UI language and LTR/RTL direction. The [playground](https://mr-rafiq.github.io/opengrid/demo/) direction lab provides a wide, scrollable example with editable cells and both pin sides.

## Navigate and edit

Pan on ordinary cell backgrounds to scroll either axis; pinch zoom remains available. A touch-down does not start mouse-style range dragging or immediately move cell focus. A completed tap focuses/selects a cell. Double-tap the same editable cell, or tap **Edit cell**, to open its configured editor. Native buttons, checkboxes, selects, links and custom interactive renderers retain their own actions.

Movement, scrolling, cancellation, another contact and changes to the model/view invalidate an unfinished tap sequence. A compatibility double-click following a recognized touch sequence does not open a duplicate editor. Native editor input, validation, commit/cancel and data undo retain their existing contracts. This does not establish virtual-keyboard behavior on a physical iOS or Android device.

## Select and fill

Tap an anchor cell, turn on **Extend range**, then tap an endpoint. You may scroll normally between those taps. Toggle the control off to resume replacing the range with each tap. Keyboard and mouse range selection remain available. Independent merged-cell examples retain their existing restrictions on rectangular operations.

Choose **Copy values** or **Extend numeric series** in **Fill mode**, then drag the dedicated fill grip. Source data remains unchanged while previewing an extension. A valid release applies one validated atomic fill transaction; one Undo restores the target values. Desktop Alt-drag continues to request a numeric series. The ordinary **Fill down** action copies within the selected range.

The fill grip has a separate touch target and `touch-action: none`, so dragging that grip owns its gesture while cell backgrounds keep native scrolling. Only its captured primary pointer can move or complete the operation. A second contact, cancellation, lost capture, Escape, unmount or a stale view cancels the gesture without writing data. The prior selection is restored where its endpoints remain valid.

## Resize and move

Resize columns with the dedicated header grip. Its width preview updates pin, window, header and merged-cell geometry. A valid release commits the width once; cancellation discards the preview. RTL uses the mirrored physical delta while keeping left/right pin meanings unchanged. Keyboard resizing remains available.

The column chooser provides hide, physical pin and move controls. Managed row movement provides Move focused row up/down controls. Native HTML drag-and-drop does not by itself provide touch header, group or row dragging; these gestures remain unsupported, and inactive touch drag grips must not consume ordinary panning.

## Verification boundary

The [verification record](VERIFICATION.md) records executed unit/component tests and native Chromium touch-input scenarios. Dispatched DOM PointerEvents alone do not prove native panning, browser cancellation or gesture ownership. Chromium touch emulation is distinct from physical-device testing; momentum, virtual keyboards, assistive touch, screen readers and Safari/Firefox/device coverage remain open. The broader feature family stays Partial.

Reference behavior is drawn from the public [AG Grid touch documentation](https://www.ag-grid.com/react-data-grid/touch/) and [W3C Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/). OpenGrid uses original code. In particular, `touch-action` determines native manipulation before a gesture starts; calling `preventDefault()` on a PointerEvent is not a substitute for that policy.
