# Image Performance Guidelines

Why this file exists: a 2.3MB image was found base64-embedded directly inside
`custom.html`'s HTML source (inflating the page to ~3.2MB before anything
could render). This doc exists so that mistake — and the slower, less
obvious ones like missing `loading="lazy"` — doesn't get repeated as new
products, candles, containers, accessories, and carousel content get added.

## Where new images should be stored

- **Product/candle/container/accessory/carousel photos**: uploaded through
  the Home Editor or Dashboard, which store them in Supabase Storage and
  save the resulting URL into the `products`/`settings` tables. This is
  already the project's pattern for everything except the one image fixed
  in this pass — keep using it. Never paste a `data:image/...;base64,...`
  string into an HTML/CSS file as a substitute for uploading.
- **Static site-chrome images that aren't tied to any database row** (e.g.
  a hero background that's part of the design, not admin-editable): save
  the file under `assets/images/` (see `assets/images/custom/` for the
  existing example) and reference it with a normal relative `src`/
  `background-image:url(...)`. Never inline it as base64.

## Recommended dimensions & formats

- Product/candle/container/accessory photos: **square, ~800×800px**
  source, displayed scaled down via CSS — matches how `object-fit:cover`
  is used everywhere in the templates.
- Hero/background images: no larger than **1600px** on the long edge —
  nothing on this site is displayed full-bleed on a 4K display, so
  shipping a 4K source is wasted bytes.
- Format: **JPEG or WebP** for photos (WebP if you can export it — same
  quality at a fraction of the size). **PNG only** for images that need
  transparency. **SVG** for icons/logos/decorative shapes.
- Max recommended file size per image: **~200KB**. If an export comes out
  bigger, compress it (e.g. squoosh.app) before uploading — don't rely on
  the browser to do it for you.

## When to use `loading="lazy"`

Use it on every `<img>` **except**:
- The hero/banner image that's visible the instant the page loads.
- The first (currently active) carousel slide.

Everything else — product grids, cart items, side-menu thumbnails, gift-set
image stacks, review media, modal/lightbox images — should be lazy. The
browser defers loading until the image is about to scroll into view, so it
never competes with what the user is actually looking at first.

## Preventing layout shift (CLS)

Every `<img>` should have its size determined **before** the network
request finishes, via one of:
- explicit `width`/`height` attributes, or
- an inline `style` with fixed `width`/`height` (what most of this
  codebase already does for thumbnails — e.g. `style="width:64px;height:64px;..."`), or
- a parent container with a fixed size, when the image itself uses
  `width:100%;height:100%` to fill it.

Don't add bare `<img src="...">` with no size information anywhere in its
style chain — that's what causes the page to visibly jump as images pop in.

## The shared helper — use it for new image code

`js/shared/img.js` exports `imgTag(opts)`, which builds a correctly-lazy,
correctly-sized `<img>` string in one call:

```js
imgTag({ src: p.img, alt: p.name, width: 64, height: 64, className: 'cart-item-img' })
// → <img class="cart-item-img" src="..." alt="..." width="64" height="64" loading="lazy" />

imgTag({ src: hero.url, alt: 'Hero', critical: true })
// → loading="eager" fetchpriority="high" — only ever use critical:true for
//    the one hero/first-slide image per page
```

It's loaded on every page (`home.html`, `shop.html`, `custom.html`,
`checkout.html`, `more.html`, `track.html`, `dashboard.html`,
`home-editor.html`). **New image-rendering code should call `imgTag()`
instead of hand-writing an `<img>` template string** — that's the one place
the lazy/sizing rule lives, so it can't be forgotten on the next page.

The existing template strings across `home.js`/`shop.js`/`checkout.js`/
`track.js`/`custom.js` were *not* rewritten to call `imgTag()` in this pass
(low-risk-first: each was given `loading="lazy"` directly in place instead,
to avoid touching more lines than necessary). New code added going forward
should prefer the helper.

## Where future additions could accidentally bypass this

- **Any new `<img ...>` written directly as a string inside a `.map()`/
  template-literal in a page's JS file**, instead of calling `imgTag()`.
  This is the most likely way the rule gets skipped — it's easy to copy an
  existing fan-stack/cart-item block (which already has `loading="lazy"`
  hardcoded) and that's fine, but a genuinely new pattern should call the
  helper instead of starting from scratch.
- **Pasting an image directly into HTML/CSS as base64** instead of
  uploading it through the Home Editor or saving it to `assets/images/` —
  this is exactly how the 2.3MB `custom.html` hero happened. If you're
  about to type `data:image/`, stop and upload the file instead.
- **The More-page content image** (`js/pages/more.js`, `more-page-img`) is
  intentionally `loading="eager"` since it's the page's primary visible
  content — don't "fix" it by adding lazy, that would just delay what the
  user came to see.
