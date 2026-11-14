# Verification puzzle images

Lab photos turned upright by visitors in the verification puzzle. Every image has
an obvious "up" (liquid lines, stands, people); top-down shots, diagrams and
rotation-symmetric subjects are excluded on purpose.

All images come from [Wikimedia Commons](https://commons.wikimedia.org) under CC0,
public domain, CC BY or CC BY-SA licenses. Sources, authors and licenses are listed in
`attributions.json` and shown on the verification site's image credits page.

Adding images:

1. `node scripts/fetch-puzzle-images.ts <staging-dir>` downloads candidates (512 px squares, metadata stripped)
2. `node scripts/contact-sheet.ts <staging-dir> sheet.png` to review them
3. Copy the good ones here and add their entries from `candidates.json` to `attributions.json`
