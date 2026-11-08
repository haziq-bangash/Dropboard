# Arcade demo: script

Arcade records your clicks in the Chrome extension and turns them into an interactive, click-through demo. It has to be recorded in a
real browser by a person, so this is the script to follow. It takes about ten minutes. Aim for **10 to 12 steps**: shorter demos get finished.

## Before you record

- Use the live site, **https://dropboard.de**, signed in with an account that has nothing private in it. The sidebar shows your name and
  email, so use a demo account (or blur it later in Arcade's editor).
- The data: `out/demo/Support tickets.csv` (made by `export-demo.ts`). The file name becomes the project name, so keep it as it is.
- Make sure the account has room for a project (the free plan allows three) and Pilot has requests left today.
- Browser: one window, about 1440 by 900, zoom 100%, bookmarks bar hidden, no other tabs showing.
- Record the Pilot answer once beforehand to know what it says, but record the demo itself with a fresh question so it is real.

## The steps

Each step: what to click, then the text to put on the Arcade step. Keep every caption to one short line.

| # | Where | Click | Caption |
|---|-------|-------|---------|
| 1 | `dropboard.de/app/new` | Hover the drop zone | **Start with any spreadsheet.** CSV, Excel or JSON. |
| 2 | Drop zone | Choose `Support tickets.csv` | **Drop it in.** It is read in your browser: your rows are never uploaded. |
| 3 | Dashboard | Scroll to the headline numbers | **A dashboard in seconds.** Charts are chosen for your columns. |
| 4 | Dashboard | Scroll to the charts | **No chart-building.** Over time, by group, and how values are spread out. |
| 5 | Tabs | Click **Insights** | **Insights, found for you.** Each is checked against chance. |
| 6 | Insights | Click **How we know** under the finding | **Every claim can be traced.** Resolution time and satisfaction move in opposite directions (r = -0.79). |
| 7 | Tabs | Click **Story** | **A story, not just charts.** The strongest finding, written up. |
| 8 | Story | Click **Save as image** | **Save it as a picture** to share or print. |
| 9 | Tabs | Click **Dashboard**, then click the question box | **Ask in plain English.** Pilot sees only column names and counts. Never your rows. |
| 10 | Question box | Type `Which priority has the slowest resolution time?`, click **Ask** | **Answers are computed in your browser.** |
| 11 | Top right | Click **Publish**, then **Create link** | **Share a read-only link.** Add a password, revoke it any time. |
| 12 | End | Stay on the dialog | **Try it free at dropboard.de.** |

## Settings in Arcade

- Use **hotspots** (the pulsing dot) on steps 1, 2, 5, 7, 9 and 11, so a visitor knows what to click.
- Turn on **auto-zoom** for steps 6 and 10, where the text is small.
- Add the **title card** "Turn any spreadsheet into a dashboard" and, on the last step, a **call to action** button to `https://dropboard.de`.
- Blur or replace anything personal in the sidebar (your name and email) with Arcade's blur tool.
- Pick a cream background and an orange accent to match the site (`#FDF6E3` and `#FF5B04`).

## Where to use it

- Embed it on the site or in the launch post (Arcade gives an embed code and a share link).
- Product Hunt's gallery takes images, GIFs and a YouTube or Vimeo video, not an Arcade link. Put the Arcade link in the **first comment** and
  the maker comment, and use `out/demo.mp4` (uploaded to YouTube) for the gallery video.
