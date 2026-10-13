import type { StorybookConfig } from '@storybook/react-vite';

// The component library's Storybook (#483), on the repo's own Vite. It loads a
// config of its own rather than the desk's vite.config.mjs, whose root, output
// directory and API proxy belong to the shipped shell.
const config: StorybookConfig = {
  stories: ['../*.stories.tsx', '../components/**/*.stories.tsx', '../screens/**/*.stories.tsx'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
    builder: {
      name: '@storybook/builder-vite',
      // Resolved from the repository root, where every npm script runs.
      options: { viteConfigPath: 'frontend/ui/.storybook/vite.config.mjs' },
    },
  },
  typescript: { reactDocgen: false },
};

export default config;
