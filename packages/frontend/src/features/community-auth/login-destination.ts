/** Route state is not trusted input; preserve only a same-site path/query/hash. */
export function loginDestination(from: unknown): string {
  if (!from || typeof from !== 'object') return '/';
  const { pathname, search = '', hash = '' } = from as Record<string, unknown>;
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//') ||
    /[\\?#\u0000-\u001f\u007f]/.test(pathname) ||
    typeof search !== 'string' || (search !== '' && !search.startsWith('?')) || /[#\u0000-\u001f\u007f]/.test(search) ||
    typeof hash !== 'string' || (hash !== '' && !hash.startsWith('#')) || /[\u0000-\u001f\u007f]/.test(hash)) return '/';
  return `${pathname}${search}${hash}`;
}
