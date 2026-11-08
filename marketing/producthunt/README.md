# Product Hunt launch assets

Everything here is made from the real product, by scripts, so it can be redone when the product changes. The outputs go to `out/` (not
committed: they are large).

## What you get

| File | What | Product Hunt field |
|------|------|--------------------|
| `out/thumbnail-480.png` | The mark on cream, square, 480 px | Thumbnail (240 px minimum) |
| `out/gallery/01-hero.png` ... `08-more.png` | Eight images, 1270 x 760 | Gallery, in this order |
| `out/gallery-2x/` | The same eight at 2540 x 1520, for sharper display | Use these if the upload allows |
| `out/demo.mp4` | About 70 seconds, 1920 x 1080, no sound | Upload to YouTube, paste the link as the video |
| `out/gifs/*.gif` | Three short loops, each under 3 MB | Gallery (GIFs up to 3 MB) or the launch post |
| `ARCADE.md` | The click-by-click script for an Arcade demo | First comment, the site |

The gallery order matters: **image 1 is the one people see in the feed** and when the launch is shared. The order is the hero, the
dashboard, Pilot, insights, the story, privacy, sharing, and the range of charts.

## The video

One continuous, real recording, with a visible cursor and short captions, and no cuts. It shows: the title card, dropping in a file, the
dashboard, Insights, the Story, a live Pilot question and its answer, and publishing a link. There is no voice-over or music; Product Hunt
plays video muted at first, so the captions carry it. Add a quiet track in an editor if you like.

## Making them again

Needs the app running locally (web on 4310, API on 4311, Postgres), with Pilot enabled for the answer shots. From the repo root:

1. `node marketing/producthunt/capture.mjs`: real screenshots at 2x, into `out/raw/`.
2. `node marketing/producthunt/compose.mjs`: the gallery images and the thumbnail.
3. `cd apps/api && pnpm exec tsx ../../marketing/producthunt/export-demo.ts`: the sample files to drop in.
4. `node marketing/producthunt/record.mjs`: the video, and `out/scenes.json` with when each scene starts.
5. `node marketing/producthunt/gifs.mjs`: the loops, cut from the video.

The scripts write a demo user into the **local** database and rename it ("Maya") so the pictures look tidy. They never touch staging or
production.

## Honest by construction

Every number and screen in these images is real output of the product on its built-in sample data. There are no invented customers,
quotes, logos or ratings, and none should be added.
