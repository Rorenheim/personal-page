# Design

Personal homepage. A light field, a large greeting, and a bento of tiles. Almost everything is grayscale. One red is reserved for emphasis.

## Color

| Token | Value | Role |
| --- | --- | --- |
| Field | `#e7e7e7` | Page background behind the fluted glass |
| Ink | `#111111` | Greeting |
| Lede | `#5a5a5a` | Line under the greeting |
| Paper | `#ffffff` | Light tiles. Text on them is `#161616` |
| Paper hover | `#f4f4f4` | Light tile hover |
| Tile | `#1c1c1c` | Default dark tile, including Personal projects. Text is white |
| Tile hover | `#262626` | Dark tile hover |
| Colophon | `#1a1a1a` | Footer type |
| Hairline | `rgba(0, 0, 0, 0.06)` | Inset edge on light tiles |
| Accent | `#f43325` | The only chromatic color |

The accent is unused on the current page. Keep the field, tiles, and type in grayscale, and spend the red on a single point of emphasis: a current mark, a small status, or one call to action. Do not tint tiles, glyphs, or the greeting with it.

Focus rings use `currentColor`, 2px, offset 4px. On the play control the offset is −8px so the ring stays inside the tile.

## Type

| Use | Family | Weight | Size | Tracking | Line height |
| --- | --- | --- | --- | --- | --- |
| Greeting | DM Sans | 600 | `clamp(88px, 15.6vw, 240px)` | −0.083em | 0.83 |
| Lede | Inter | 500 | 24px (18px under 900px) | — | 1.45 |
| Tile title, Play | Space Grotesk | 500 | 28px (26px under 900px) | −0.045em | 1.05 |
| Motto | Doto, `ROND` 100 | 600 | `clamp(28px, 2.5vw, 40px)` | −0.03em | 0.95 |
| Link labels | Space Grotesk | 500 | 13px | −0.03em | — |
| Colophon | Space Grotesk | 500 | 15px | −0.03em | — |

Inter is the fallback everywhere. The greeting has a hair space after “Hello”. The motto is three centered lines: “Work hard.” “Think weird.” “Have fun.”

Greeting, lede, year, legal links, and the clock are ink. Each string is drawn twice: a face clipped to the live silhouette, and a rim that is the same image inverted, blurred 1.6px, and shifted to the element’s position. When the shader is not live, the face falls back to solid ink or lede color.

## Layout

The work column is 1120px wide, with 40px of page margin (16px under 900px). Tiles sit on a 30px gap. Corner radius is 28px.

Desktop rows, width ratio then height against a 1120-wide column:

| Row | Split | Ratio | Contents |
| --- | --- | --- | --- |
| A | 430 / 660 | 1120 × 368 | About (paper), Work (tile) |
| Feature | 660 / 430 | 1120 × 766 | Personal projects (feature). Right stack is motto (paper) over Blog (tile), equal rows |
| C | 430 / 660 | 1120 × 368 | Links (paper), Guiding principles (tile) |
| D | 660 / 430 | 1120 × 368 | Play (tile), Book recommendations (paper) |

Titles sit 26px from the left and 22px from the bottom. Glyphs occupy the tile above that title band.

Under 900px every row becomes one column. Tiles use a 4 / 3.15 ratio, and Personal projects uses 4 / 4.4. The footer wraps, and the legal links drop to their own line.

The hero is centered, at least 70vh, with `26vh` above the greeting and `16vh` below the lede. The lede maxes out at 560px.

## Tiles

Two surfaces, used in alternation so a dark tile never sits against another dark tile in the same row.

- **Paper.** White, near-black type, a 1px inset hairline.
- **Tile.** `#1c1c1c`, white type. Personal projects is the feature variant and holds the liftoff scene.

Hover shifts the fill over 0.45s with `cubic-bezier(0.22, 1, 0.36, 1)`. Light tiles go to `#f4f4f4`. Dark tiles go to `#262626`. LinkedIn, GitHub, and Email fade to 0.42 opacity instead of changing the tile. Colophon links fade to 0.55 over 0.8s.

Glyphs are dot drawings in `currentColor`, one literal idea per tile so the picture says the title before it is read:

| Tile | Glyph |
| --- | --- |
| About | A waving hand, echoing the greeting |
| Work | A briefcase |
| Blog | An upright pencil finishing a written line |
| Guiding principles | A compass, slim needle pointing north |
| Book recommendations | An open book with a bookmark peeking out of the spine |
| Play | The invader |
| Links | An `in` monogram, the GitHub cat, an envelope |

Keep glyphs axis-aligned at rest: diagonals turn into a lattice at this dot size. On hover the accent dots turn red.

Never rotate, shift, or scale a dot glyph with CSS: moved dots fall off the lattice and smear. Moving parts are redrawn onto the grid every frame through their pose, so every dot stays on the grid, and at rest every dot is full size. How a pose lands depends on the part. Thin parts that travel far, like the needle, size each dot by how much of its cell they cover, which reads smooth. Broad shapes, like the hand and the briefcase lid, keep a full dot wherever they cover at least half the cell, because partial dots would fringe their edges. Lines one dot wide, like the cat's tail, move each dot to its nearest cell. Each pose rides a damped spring, so entering can kick a part, the pointer can pull it, and leaving lets it swing back and settle without a snap.

| Tile | Motion |
| --- | --- |
| About | The hand waves from the wrist and leans toward the pointer |
| Work | The lid pops open on its hinge, wider toward the right of the tile |
| Blog | The pencil follows the pointer along the line. Ink exists only behind its tip, so sliding left erases and sliding right writes. It leans against its motion |
| Guiding principles | The needle kicks, leans up to about 20° toward the pointer, and settles on north |
| Book recommendations | The bookmark is drawn up out of the spine, hidden below the page edge, and tilts toward the pointer |
| Play | The invader tracks the pointer sideways and marches, swapping legs on a beat. Its eyes light up |
| LinkedIn | The tittle hops and stretches with its speed |
| GitHub | The tail wags from its root |
| Email | The flap folds open over its hinge, passing edge-on |

Personal projects replaces its glyph with a stippled liftoff: a rocket lit from the upper left, a flame, and an exhaust cloud billowing past both edges under a sparse star field. The bottom-left corner thins out around the title. On hover the rocket rises, the flame stretches and flickers, the cloud breathes, the tile tilts, and the red sweep runs once. On leave the loops keep running while they fade out into the resting pose.

Play is a tile, not a link. “Play” is set like a title. Activating it hides the invader and the label and runs the game on a canvas that fills the tile.

## Field and cursor

The page background is a fixed fluted-glass shader over a silhouette still. Highlights are white, shadows are black, the glass reads as fine vertical lines. A muted looping video of the same silhouette feeds the ink in the type. The field does not take pointer events.

On a fine pointer, the cursor is hidden. A 12px white dot with `mix-blend-mode: difference` follows the pointer, and 6px dots trail it for about 420ms, dropped every 14px of travel.

On Personal projects, over 900px with a fine pointer, hovering a screenshot raises a magnifier (`js/lens.js`): one 320px WebGL lens that follows the pointer and shows that spot at 2.2× from the sharpest file in the image’s `srcset`. The glass stays flat almost to the rim, bending only in the outer few pixels, with a faint darker edge, a thin light arc toward the upper left, and a soft drop shadow. It pops in from 0.55× over 0.45s and fades out on leave. The cursor head stays on top as its center mark, and the trail hides while the lens is up.

`prefers-reduced-motion` removes tile transitions, the cursor trail, glyph motion, and the liftoff motion. The glass and type stay.

## Footer

Three items on one baseline, Space Grotesk, tabular numbers: the year, Imprint and Privacy policy, then a live clock (`Tue 3 Nov · 22:49:05`). Year and clock share the ink treatment with the greeting.

## Subpages

About, Work, Personal projects, Blog, Guiding principles, Book recommendations, Imprint, and Privacy policy share one shell, styled in `css/pages.css` on top of `css/styles.css`. Play, Links, and the motto stay on the homepage only. The homepage has no menu.

### Field

The same fluted glass (`js/glass.js`), fed by a slow drift of soft grayscale shapes instead of the silhouette video (`js/drift.js`): discs, capsules, and rings on 70 to 120 second sine paths. Over them, five thin slanted streaks slide sideways on 40 to 64 second paths, which the flutes break into steps. Two arcs turn slowly in opposite directions, 18 soft motes rise and wrap around, and a faint band of light sweeps across every 34 seconds. Everything stays between `#c8c8c8` and white on the `#e7e7e7` field, so the glass only shows soft refractions behind text. It redraws at 30fps, holds still when the tab is hidden, and draws one frame under reduced motion. There is no ink effect on subpages: type is solid `#111`.

### Shell

- **Bar.** Fixed, 24px from the edges (16px under 900px). Left: a white pill, “Paul Kalaba”, linking home. Right: the menu toggle, a white pill with two 18px lines and the word “Menu”. Open, the lines cross into an X and the word becomes “Close”. Pills are 48px tall (44px on mobile), Space Grotesk 16px.
- **Menu.** A full-screen white sheet that opens as a circle growing from the toggle (0.85s, `cubic-bezier(0.16, 1, 0.3, 1)`) and closes faster. Pages are listed in Space Grotesk 500, `clamp(40px, 6.2vh, 76px)`, staggered 45ms apart. Hovering or keyboard-focusing one dims the rest to 0.28. The current page carries a red dot, the only red in the menu. LinkedIn, GitHub, Email, Imprint, and Privacy sit in a 15px row at the bottom. Esc closes it, everything outside the bar and menu is inert while it is open, and the page does not scroll. The list lives in `js/menu.js`.
- **Head.** Title in DM Sans 600, `clamp(60px, 9vw, 120px)`, −0.05em, line height 0.86. Lede in Inter 500, 22px, lede gray, up to 600px. No eyebrow or label above the title. Content starts 176px from the top (120px on mobile).
- **Paper.** Long text sits on a white card, radius 28px, hairline inset, 48px padding. Body is Inter 500, 17px, line height 1.6, up to 40rem.
- **Button.** Black pill, 56px, Space Grotesk 17px, with an arrow. On hover it turns accent red and the arrow moves 4px. One per page at most, so it is that page's red.
- **Colophon.** The homepage footer, 128px below the content.

### Pages

| Page | Pattern |
| --- | --- |
| About | A 320px circle playing `assets/portrait-settle.mp4` once, muted, grayscale, zoomed 1.5× toward the head. Beside it the name as the title and “Product Manager @ Qonto” in Space Grotesk. Below, a paper article and the Contact me button (`mailto:paul@kalaba.me`). |
| Work | A horizontal timeline. A pill of start years and two round arrow buttons sit above a full-bleed track. The focused role is pinned to the column edge at full strength, with a red node on the rail. Other roles fade with distance (1, 0.42, 0.26, 0.16) and shrink 3.5% per step. Clicking a role, a year, an arrow button, or an arrow key slides the track (0.95s, `cubic-bezier(0.16, 1, 0.3, 1)`). Each role shows years, company in DM Sans, position, and 4 to 6 products on hairline rows. Under 900px it is a vertical list where only the focused role shows its products. |
| Personal projects | The one dark page (`html.theme-dark`): the drift drawing is inverted before the glass, so the field is `#181818`, type is `#f2f2f2` with `#a5a5a5` for the lede, and name tiles lift to `#262626` with a light hairline. Paper tiles, white pills, and the menu stay as they are. A carousel, one bento per project on a 12 × 4 grid at 1120 / 700. Every slide has a dark name tile, a paper description tile, and two dotted image tiles of different sizes, and each slide arranges them differently (`data-layout` a to e). A project with phone screenshots uses `screens` instead: the name and description share a short top row, and four portrait screenshots sit uncropped below, four across (two by two under 900px, radius 20px). Screenshots ship as 640px JPEGs with the originals in `srcset`. A project with a logo and desktop screenshots uses `docs`, two columns on one gutter: the name over two stacked screenshots on the left (5 columns), a square logo and the description over one tall screenshot on the right (3 + 4 columns). The stacked screenshots stay uncropped at 16:9, so the slide runs 1120 / 820. The tall one is the exported HTML, cropped from its top-left and zoomed 1.15× (1.45× under 900px) so the code reads; under 900px the logo crops to 4 / 3 and the screenshots stack. A project with two phone screenshots uses `pair`: the grid splits into three equal 4-column parts, the name over a content-height description on the left and the two phones at full height beside it, inside the 1120 / 700 frame; under 900px the phones sit side by side. A project with three wide images uses `trio`, the mirror of `docs`: the name (7 columns) over one tall image on the left, the description (5 columns) over two stacked 16:9 images on the right. A project with three wide screenshots that read as steps uses `quad`, a 2 × 2 of halves: the name over a content-height description top left, then the screenshots in reading order (top right, bottom left, bottom right), the bottom row exactly half the frame so both rows match. Each figure sets its own `--ratio` so the screenshot sits whole in its dotted frame. Images whose content sits in the middle of a large backdrop are zoomed per tile with `--zoom` on a `.t-zoom` figure. Slides keep their own height, and the viewport follows the active one. Tiles enter in sequence, 70ms apart. Counter, dots, arrow buttons, arrow keys, swipe, and `#project-id` links all move between slides. Under 900px the tiles stack. |
| Blog | A 720px column of paper posts: date, link to LinkedIn, optional title in Space Grotesk 30px, text, and optional image or video with controls. A sticky aside holds the Follow on LinkedIn button. A template for new posts is commented in the HTML. |
| Guiding principles | A manifesto. Each principle gets most of a screen: a Doto numeral on the left, the statement in DM Sans up to 104px, and one line of reasoning. Statements reveal from a clip as they scroll in. Below them, a dark tile titled “Non-negotiables” with a red full stop lists four lines. |
| Book recommendations | A preamble, then rows of “Title — Author” on hairlines: title in DM Sans, author in lede gray, an arrow on the right. Each row opens a Google search for the title and author in a new tab. Hover fills the row white. |
| Imprint, Privacy | Title, a red status line, and the text on paper. |
