import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FarmCropArt, farmCropArtKey } from './FarmCropArt';

afterEach(cleanup);
describe('FarmCropArt', () => {
  it.each([
    ['desk_mint', '工位薄荷'], ['meeting_tomato', '会议番茄'],
    ['deadline_strawberry', '截止日草莓'], ['overtime_coffee', '加班咖啡果'],
    ['promotion_sunflower', '晋升向日葵'], ['annual_moonflower', '年终月光花'],
  ])('renders an accessible crop-specific native illustration for %s', (key, label) => {
    render(<FarmCropArt cropKey={key} label={label} />);
    const art = screen.getByRole('img', { name: `${label}图标` });
    expect(art).toHaveAttribute('data-crop-art', key);
    expect(art.querySelector('image, script, foreignObject')).toBeNull();
  });
  it('has distinct drawings, supports old saves and safely falls back for unknown crops', () => {
    expect(farmCropArtKey('desk-mint')).toBe('desk_mint');
    expect(farmCropArtKey(undefined)).toBe('seedling');
    const keys = ['desk_mint', 'meeting_tomato', 'deadline_strawberry', 'overtime_coffee', 'promotion_sunflower', 'annual_moonflower'];
    const drawings = keys.map((key) => {
      const { container, unmount } = render(<FarmCropArt cropKey={key} label="作物" />);
      const drawing = container.querySelector('svg')!.innerHTML;
      unmount(); return drawing;
    });
    expect(new Set(drawings).size).toBe(6);
    render(<FarmCropArt cropKey={'<script>bad</script>'} label="<作物>" scene />);
    expect(screen.getByRole('img')).toHaveAttribute('data-crop-art', 'seedling');
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 160 205');
  });
});
