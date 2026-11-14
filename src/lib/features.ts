import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { SapphireClient } from '@sapphire/framework';

const FEATURES_DIR = new URL('../features/', import.meta.url);

/**
 * Each folder in src/features/ is a self-contained feature with its own Sapphire
 * piece folders (commands/, listeners/, interaction-handlers/, …) next to its
 * plain logic. Sapphire's default scan only covers the top-level folders, so each
 * feature root has to be registered explicitly.
 */
export async function registerFeatures(client: SapphireClient): Promise<string[]> {
	const entries = await readdir(FEATURES_DIR, { withFileTypes: true });
	const features = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

	for (const feature of features) {
		client.stores.registerPath(fileURLToPath(new URL(`${feature}/`, FEATURES_DIR)));
	}

	return features;
}
