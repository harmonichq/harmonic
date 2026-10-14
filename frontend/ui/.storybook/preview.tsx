import type { Decorator, Preview } from '@storybook/react-vite';
import '../tokens.css';
import './preview.css';

// Every story renders inside one frame: the canvas ground, the side margin of
// its width (§2.1: 16 phone, 32 desktop), and the story's own width. The
// screenshot harness captures exactly this element. `pseudo` holds a pressed
// or focused state still for review.
type Frame = { width: number; height?: number; padding?: number };

const frame: Decorator = (Story, context) => {
  const { width, height, padding } = (context.parameters.frame ?? { width: 390 }) as Frame;
  const pseudo = context.parameters.pseudo as string | undefined;
  return (
    <div
      data-shot=""
      className={pseudo ? `sb-${pseudo}` : undefined}
      style={{
        width,
        height,
        padding: padding ?? (width >= 1024 ? 32 : 16),
        boxSizing: 'border-box',
        background: 'var(--wk-canvas)',
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [frame],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    controls: { disable: true },
    actions: { disable: true },
  },
};

export default preview;
