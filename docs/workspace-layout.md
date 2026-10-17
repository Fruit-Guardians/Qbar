# Request / response workspace

- Basic and Raw each remember their own layout and split ratio on this device.
- Auto and side-by-side use columns at 700px and wider. Below 700px the effective layout is stacked without changing the saved preference.
- Drag the divider to resize (20–80%). Arrow keys adjust by 2%, Shift+arrows by 10%, Home/End select the limits. Double-click or Reset split restores 50%.
- Layout writes are serialized. Late preference reads never overwrite a user interaction. A write failure leaves the local layout usable and reports that it is panel-only.
- Response Body shows the original body in Raw mode, a display-only JSON projection in Pretty, and parsed JSON in Tree. No source payload is rewritten.
- Response Headers retains the captured order and duplicate fields. HTTP retains the existing combined protocol/status/headers/body representation; browser captures are not wire-byte captures.
- Empty captured bodies and unavailable bodies have distinct states. Copy-body is disabled when a body is absent or empty; captured headers remain accessible.
- Response headings show the available HTTP status, duration and body byte count. A missing byte count is not presented as zero.

This iteration changes presentation only. Auth, Cookie policy controls, richer comparison, and native-extension regression acceptance remain separate follow-up work. Existing request transport tests still run in the local suite; browser preview sends fixture responses only.
