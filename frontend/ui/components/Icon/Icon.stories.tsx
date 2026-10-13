import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, type IconName } from '../../icons';

// Every glyph at the library's one icon size (§4.1: 20 px), in a 44 px target.
function Glyphs({ names }: { names: IconName[] }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {names.map((n) => (
        <span key={n} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', color: 'var(--wk-ink)' }}>
          <Icon name={n} />
        </span>
      ))}
    </div>
  );
}

const meta: Meta<typeof Glyphs> = { title: 'Icon', component: Glyphs, parameters: { frame: { width: 420 } } };
export default meta;
type Story = StoryObj<typeof Glyphs>;

export const Navigation: Story = { args: { names: ['queue', 'changes', 'overview', 'day', 'settings'] } };
export const Kinds: Story = { args: { names: ['pattern', 'setting'] } };
export const Actions: Story = { args: { names: ['snooze', 'expand', 'collapse', 'previous', 'next'] } };
export const Events: Story = { args: { names: ['meal', 'correction', 'carbs', 'site', 'sleep'] } };
