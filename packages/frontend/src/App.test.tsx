import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({ fail: false }));
vi.mock('./app/router', () => ({ AppRouter: () => {
  if (control.fail) throw new Error('synthetic-private-message-must-not-be-rendered');
  return <h1>正常页面</h1>;
} }));
vi.mock('./components', () => ({ Footer: () => <footer>页脚</footer> }));
import { App } from './App';

describe('application render failure recovery', () => {
  beforeEach(() => { control.fail = false; vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });
  it('keeps normal pages available', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '正常页面' })).toBeInTheDocument();
  });
  it('offers manual recovery instead of unmounting the entire application', () => {
    control.fail = true;
    expect(() => render(<App />)).not.toThrow();
    expect(screen.getByRole('alert')).toHaveTextContent('页面暂时无法加载');
    expect(screen.getByRole('button', { name: '重新加载当前页' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/synthetic-private-message/)).not.toBeInTheDocument();
  });
});
