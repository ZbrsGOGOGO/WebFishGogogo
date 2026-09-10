import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BallpointWindowProvider, useBallpointWindow } from './BallpointWindow';

const mock = vi.hoisted(() => ({ identity: { phase: 'guest', user: null as { publicId: string } | null }, mounts: 0, unmounts: 0 }));
vi.mock('../../../app/store/community-auth-store', () => ({ useCommunityAuthStore: (select: (state: typeof mock.identity) => unknown) => select(mock.identity) }));
vi.mock('./BallpointBreachGame', () => ({ default: function FakeGame({ active, onPrivacyPause, onStatusChange }: { active: boolean; onPrivacyPause?: () => void; onStatusChange: (value: string) => void }) {
  useEffect(() => { mock.mounts += 1; return () => { mock.unmounts += 1; }; }, []);
  return <div aria-label="fake local game" data-active={active}><button onClick={onPrivacyPause}>simulate pointer unlock</button><button onClick={() => onStatusChange('playing')}>simulate playing</button></div>;
} }));
function Content() { const state = useBallpointWindow(); return <><button onClick={state.openWindow}>open</button><Link to="/farm">farm</Link><textarea aria-label="site input" /><output aria-label="activity mode">{state.isPlaying ? 'game' : 'browse'}</output></>; }
function App() { return <MemoryRouter initialEntries={['/games']}><BallpointWindowProvider><Content /></BallpointWindowProvider></MemoryRouter>; }
beforeEach(() => { mock.identity = { phase: 'guest', user: null }; mock.mounts = 0; mock.unmounts = 0; });
afterEach(cleanup);
async function open() { fireEvent.click(screen.getByText('open')); await screen.findByLabelText('fake local game'); }
describe('persistent Ballpoint window', () => {
  it('reports only a visible running window as game activity, never idle/covered/minimized', async () => {
    render(<App />); await open(); expect(screen.getByLabelText('activity mode')).toHaveTextContent('browse');
    fireEvent.click(screen.getByText('simulate playing')); expect(screen.getByLabelText('activity mode')).toHaveTextContent('game');
    fireEvent.click(screen.getByLabelText('最小化工作稿')); expect(screen.getByLabelText('activity mode')).toHaveTextContent('browse');
    fireEvent.click(screen.getByLabelText('恢复工作稿')); expect(screen.getByLabelText('activity mode')).toHaveTextContent('game');
    fireEvent.click(screen.getByText('便签')); expect(screen.getByLabelText('activity mode')).toHaveTextContent('browse');
  });
  it('covers the game on pointer-lock loss even if the browser omits Escape keydown', async () => {
    render(<App />); await open(); fireEvent.click(screen.getByText('simulate pointer unlock'));
    expect(screen.getByLabelText('工作稿临时便签')).toBeInTheDocument();
    expect(screen.getByLabelText('fake local game').closest('.bp-window-game')).toHaveAttribute('hidden');
  });
  it('does not mount a renderer until explicitly opened', async () => {
    render(<App />); expect(screen.queryByLabelText('fake local game')).toBeNull(); expect(mock.mounts).toBe(0);
    await open(); expect(mock.mounts).toBe(1);
  });
  it('keeps one game across site navigation, minimizes without unmounting and resumes manually', async () => {
    render(<App />); await open();
    fireEvent.click(screen.getByText('farm'));
    expect(screen.getByLabelText('工作稿临时便签')).toBeInTheDocument();
    expect(screen.getByLabelText('fake local game')).toHaveAttribute('data-active', 'false'); expect(mock.mounts).toBe(1);
    fireEvent.click(screen.getByLabelText('最小化工作稿'));
    expect(mock.unmounts).toBe(0);
    fireEvent.click(screen.getByLabelText('恢复工作稿'));
    fireEvent.click(screen.getAllByText('返回练习')[0]!);
    expect(screen.getByLabelText('fake local game')).toHaveAttribute('data-active', 'true'); expect(mock.mounts).toBe(1);
  });
  it('Escape and tab hiding cover/pause; a textarea keeps its default editing event', async () => {
    render(<App />); await open();
    const input = screen.getByLabelText('site input'); input.focus();
    const key = new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }); input.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByLabelText('fake local game')).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getAllByText('返回练习')[0]!);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByLabelText('fake local game')).toHaveAttribute('data-active', 'false'); hidden.mockRestore();
  });
  it('close destroys the session, clears notes, and reopening creates a new one', async () => {
    render(<App />); await open(); fireEvent.click(screen.getByText('便签'));
    fireEvent.change(screen.getByLabelText('随手记录'), { target: { value: 'private memo' } });
    fireEvent.click(screen.getByLabelText('关闭工作稿并结束本轮'));
    expect(mock.unmounts).toBe(1); await open(); expect(mock.mounts).toBe(2);
    fireEvent.click(screen.getByText('便签')); expect(screen.getByLabelText('随手记录')).toHaveValue('');
  });
  it('drops the old window on logout or account switch and never reopens it automatically', async () => {
    mock.identity = { phase: 'active', user: { publicId: 'one' } };
    const view = render(<App />); await open();
    mock.identity = { phase: 'active', user: { publicId: 'two' } };
    act(() => view.rerender(<App />));
    expect(screen.queryByLabelText('fake local game')).toBeNull(); expect(mock.unmounts).toBe(1);
    await open(); mock.identity = { phase: 'guest', user: null }; view.rerender(<App />);
    await waitFor(() => expect(screen.queryByLabelText('fake local game')).toBeNull());
    expect(mock.unmounts).toBe(2);
  });
});
