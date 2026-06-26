# Custom Builder Guide ("Build Your Own Gift Set")

This page (`custom.html`) renders entirely from data stored in Supabase —
the `settings` table, row with `key = 'giftSet'`, `value` column (JSON).
No HTML, CSS, or JS changes are needed to add new sizes, candles,
containers, or accessories.

## Files involved

| File | Role |
|---|---|
| `custom.html` | Markup + the `<script type="module">` block that fetches `settings.giftSet` from Supabase and calls the build functions below |
| `js/custom.js` | All builder logic: `buildSizeGrid`, `buildContainerGrid`, `buildAccessoriesGrid`, selection state, cart, totals |
| `css/custom.css` | All styles scoped to `.custom-scope`, plus the `.candle-img-overlay` page overrides |

## Data shape (`settings.giftSet.value`)

```js
{
  step2Title: "...",        // optional, overrides #step2Title text
  step2Subtitle: "...",     // optional, overrides #step2Subtitle text
  heroImg: "https://...",   // optional, overrides #buildHero background image
  sizes: [
    { label: "Small", weight: "500g", price: 150, img: "https://..." },
    ...
  ],
  candlesBySize: {
    size_0: [ { /* candle fields */ }, ... ],
    size_1: [ ... ],
    ...
  },
  containers: [ { /* container fields, optional variants[] / images[] */ }, ... ],
  accessories: [ { /* accessory fields */ }, ... ]
}
```

- `sizes[i]` corresponds to `candlesBySize.size_<i>` (the key is built from the
  size's index in the `sizes` array).
- If `sizes` is empty/missing, `js/custom.js`'s `DEFAULT_SIZES` is used instead.

## Adding new candles, containers, accessories, or sizes

Add the new entry to the relevant array/object inside `settings.giftSet.value`
in Supabase. The existing generic CSS classes (`.size-card`, `.candle-card`,
`.container-card`, `.cont-modal-*`, `.sticky-bar`, `.sb-*`) already handle any
number of items — no new CSS is required.

## Adding new images

Place new images under `assets/images/custom/`:

- `assets/images/custom/candles/`
- `assets/images/custom/containers/`
- `assets/images/custom/accessories/`
- `assets/images/custom/placeholders/`

Then reference the image URL/path from the corresponding entry in
`settings.giftSet.value`.

## What NOT to touch for routine catalog updates

- `js/custom.js` — pure rendering logic, driven entirely by the data above.
- `css/custom.css` — generic, scales to any number of items.
- `custom.html`'s `<script type="module">` block — only fetches and passes
  data through; doesn't need to know about specific candles/containers/etc.
