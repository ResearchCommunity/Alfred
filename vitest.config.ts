import { defineConfig } from 'vitest/config'

export default defineConfig({
    // Vite 8 transforms TS with Oxc and no longer reliably inherits `experimentalDecorators`
    // from tsconfig — without this, Sapphire's @ApplyOptions is emitted raw and explodes.
    oxc: {
        decorator: { legacy: true },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
})
