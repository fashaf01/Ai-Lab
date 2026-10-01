# Labshelf — brand & site design

> "Labshelf" is a **working name**. It lives in `public/index.html`, the `brand` link in `public/app.js`,
> `public/logo.svg` and this file, so renaming is a quick find-and-replace.

## Idea
Every AI-made creation is a **specimen**: catalogued with a number, labelled with what made it, and placed
on a shelf where ordinary people can pick it up for a few dollars. Lab (made with AI) + shelf (a place to buy).

**Personality:** a helpful shopkeeper who builds things — warm, plain-spoken, tactile, a little nerdy.
**Tagline:** *Made by AI. Priced for people.*

## Visual identity
- **Logo:** a flask with orange liquid standing on a shelf line + lowercase serif wordmark `labshelf`.
  Files: `public/logo.svg`, `public/favicon.svg`.
- **Colour:** Paper `#F3EEE3` · Ink `#15120E` · Reaction orange `#FF5A2C` (the only accent — actions & prices).
  Category label colours (never used for text): plugin `#C8F169`, website `#9ED8FF`, agent `#CBB9FF`,
  template `#FFE27A`, prompt-pack `#FFB8D1`, script `#9BE8C8`, other `#D9D2C0`. Full dark theme included.
- **Type:** Display = Iowan/Palatino/Georgia serif · Labels & numbers = system mono, uppercase, tracked ·
  Body = system sans. No web-font downloads (fast, private).
- **Signature elements:** specimen *tag cards* (coloured band, `№ 0042` item number, punched hole, dashed
  perforation, tilted price sticker); hard 2px ink outlines with offset shadows (no blur); dotted-paper
  background; orange highlighter underline on one word per headline; scrolling category ticker.
- **Motion:** cards lift on hover and press in on click; gentle float on hero tags. All motion is disabled
  under `prefers-reduced-motion`.

## Voice
Say: "Put it on the shelf." · "Keep 90%." · "Made with Claude."
Avoid: hype ("revolutionary", "supercharge"), buzzwords, hidden fees.

## Site structure
```
/            Home — hero · ticker · pick-a-shelf · fresh · how it works · creator CTA
├─ /shelves[/category]   Browse, search, sort
│   └─ /item/:id         Specimen sheet + buy panel
├─ /how                  Fees & promises
├─ /creators             Pitch + live earnings calculator
├─ /register · /login
├─ /brand                Living brand guide
└─ signed in: /library · /sell[/:id] · /creator (earnings) · /admin
```

## Accessibility
Ink-on-paper contrast ≥ 15:1; pastels only ever carry ink text; visible 3px orange focus rings; skip link;
labelled form fields; responsive down to 360px with no horizontal scroll.
