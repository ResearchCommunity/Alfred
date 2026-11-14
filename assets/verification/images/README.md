# Verification puzzle images

Visitors turn one of these upright in the verification puzzle. Good puzzle images have
an obvious "up" (liquid lines, stands, people) and no text, watermarks or credit bars,
which would give the orientation away to a machine. Top-down shots, diagrams and
rotation-symmetric subjects don't work.

## Bundled pool (this folder)

Lab photos from [Wikimedia Commons](https://commons.wikimedia.org) under CC0, public
domain, CC BY or CC BY-SA licenses. They're the fallback for development, tests and CI,
used whenever no local pool is set up.

## Local pool (`puzzle-images/`, not in git)

The real pool lives in a folder that is never committed: `PUZZLE_IMAGES_DIR`, by default
`puzzle-images/` in the working directory. `compose.yaml` mounts `./puzzle-images` into
the container. If that folder is missing or holds no images, the bundled pool is used
(the bot logs a warning).

## `images.json`

Optional, next to the images. One entry per image, every field but `file` optional:

```json
[
	{
		"file": "shulgin-01.jpg",
		"caption": "Shown after the visitor answered: what the picture shows, plus something worth knowing.",
		"source": "https://example.org/where-it-came-from",
		"author": "Who made it",
		"license": "CC BY 4.0"
	}
]
```

These fields are records only. The site never shows or links them: a list of the originals,
the right way up, would be an answer key for bots.

## Adding images to the bundled pool

1. `node scripts/fetch-puzzle-images.ts <staging-dir>` downloads candidates (512 px squares, metadata stripped)
2. `node scripts/contact-sheet.ts <staging-dir> sheet.png` to review them
3. Copy the good ones here and add their entries from `candidates.json` to `images.json`
