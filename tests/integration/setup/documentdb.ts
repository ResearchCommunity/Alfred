import type { TestProject } from 'vitest/node';
import { GenericContainer, Wait } from 'testcontainers';

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}

// Same image as compose.yaml, so tests run against exactly what production runs
const IMAGE = 'ghcr.io/documentdb/documentdb/documentdb-local:pg18-1.2.0';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
	const container = await new GenericContainer(IMAGE)
		.withEnvironment({ USERNAME: 'test', PASSWORD: 'test', DO_NOT_TRACK: '1' })
		.withExposedPorts(10260)
		.withWaitStrategy(Wait.forHealthCheck())
		.withStartupTimeout(120_000)
		.start();

	project.provide('databaseUrl', `mongodb://test:test@${container.getHost()}:${container.getMappedPort(10260)}/`);

	return async () => {
		await container.stop();
	};
}
