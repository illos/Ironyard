/**
 * Vitest configuration for @ironyard/web.
 *
 * Component tests render React into a jsdom-backed DOM via
 * @testing-library/react. The main vite.config.ts stays scoped to dev/build
 * concerns to avoid pulling vitest's vite version into the production build.
 */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
