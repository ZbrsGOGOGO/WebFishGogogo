import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Theme } from '@stealth-reader/shared';

import { ReadingControls } from './ReadingControls';
import { useReadingSettings } from './useReadingSettings';
import { getPreferences, updatePreferences } from '../../api/preferences';

vi.mock('../../api/preferences', () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

const getPreferencesMock = getPreferences as unknown as ReturnType<
  typeof vi.fn
>;
const updatePreferencesMock = updatePreferences as unknown as ReturnType<
  typeof vi.fn
>;

function makePrefs(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    activeSkin: 'csdn',
    fontSize: 16,
    lineHeight: '1.8',
    theme: 'light',
    bossKey: 'Escape',
    profession: null,
    settings: {},
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// 测试用宿主：将 hook 状态接入受控的 ReadingControls。
function Host({ delay = 10 }: { delay?: number }) {
  const settings = useReadingSettings(delay);
  return <ReadingControls settings={settings} />;
}

describe('ReadingControls + useReadingSettings (Req 6.4, 6.5)', () => {
  beforeEach(() => {
    getPreferencesMock.mockReset();
    updatePreferencesMock.mockReset();
    updatePreferencesMock.mockResolvedValue(makePrefs());
  });

  it('restores persisted settings from preferences (Req 6.4, 6.5)', async () => {
    getPreferencesMock.mockResolvedValue(
      makePrefs({
        fontSize: 20,
        lineHeight: '2.0',
        theme: 'dark',
        settings: { readingMode: 'paging' },
      }),
    );

    render(<Host />);

    await waitFor(() => {
      expect(screen.getByText('20')).toBeInTheDocument();
    });
    expect(screen.getByText('2.0')).toBeInTheDocument();
    // dark theme toggle reflects pressed state
    expect(
      screen.getByRole('button', { name: '切换明暗主题' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // paging mode radio checked
    expect(screen.getByRole('radio', { name: '翻页' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('persists font size change to preferences (Req 6.4)', async () => {
    getPreferencesMock.mockResolvedValue(makePrefs({ fontSize: 16 }));
    render(<Host />);

    await waitFor(() => expect(screen.getByText('16')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: '增大字号' }).click();
    });

    expect(screen.getByText('17')).toBeInTheDocument();
    await waitFor(() => {
      expect(updatePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({ fontSize: 17, theme: Theme.Light }),
      );
    });
  });

  it('persists reading mode toggle into settings (Req 6.5)', async () => {
    getPreferencesMock.mockResolvedValue(makePrefs({ settings: {} }));
    render(<Host />);

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '滚动' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );

    await act(async () => {
      screen.getByRole('radio', { name: '翻页' }).click();
    });

    await waitFor(() => {
      expect(updatePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ readingMode: 'paging' }),
        }),
      );
    });
  });

  it('clamps font size to the max bound', async () => {
    getPreferencesMock.mockResolvedValue(makePrefs({ fontSize: 30 }));
    render(<Host />);

    await waitFor(() => expect(screen.getByText('30')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: '增大字号' }).click();
    });

    // stays at max 30
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});
