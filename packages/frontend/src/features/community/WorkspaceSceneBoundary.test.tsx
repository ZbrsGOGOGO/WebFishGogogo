import { lazy, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceSceneBoundary } from './WorkspaceSceneBoundary';

const suppressExpectedChunkError = (event: ErrorEvent): void => { if (event.error instanceof Error && event.error.message === 'network chunk load failed') event.preventDefault(); };
beforeEach(() => window.addEventListener('error', suppressExpectedChunkError));
afterEach(() => { window.removeEventListener('error', suppressExpectedChunkError); vi.restoreAllMocks(); });
it('contains an actual rejected lazy-import promise and leaves sibling content usable', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const UnavailableChunk = lazy(() => Promise.reject(new Error('network chunk load failed')));
  render(<><h1>工作台仍可用</h1><button>打开工具</button><WorkspaceSceneBoundary><Suspense fallback={<p>加载场景</p>}><UnavailableChunk /></Suspense></WorkspaceSceneBoundary></>);
  expect(await screen.findByText('3D 场景暂时没有加载成功')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '工作台仍可用' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开工具' })).toBeEnabled();
  expect(screen.queryByText('network chunk load failed')).not.toBeInTheDocument();
});
