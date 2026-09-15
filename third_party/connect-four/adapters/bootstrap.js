// Site-owned adapter: sandboxed browsers can reject form submission BEFORE
// firing submit. Handle explicit clicks/Enter instead; never add allow-forms.
// No cookie/storage/network integration.
document.addEventListener('DOMContentLoaded', () => {
  const closeDialog = (form, value) => {
    const dialog = form.closest('dialog');
    if (dialog?.open) dialog.close(value || 'confirm');
  };
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button[type="submit"], button:not([type]), input[type="submit"]') : null;
    const form = button?.closest('form[method="dialog"]');
    if (!form || button.disabled) return;
    event.preventDefault();
    closeDialog(form, button.value);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const form = event.target instanceof Element ? event.target.closest('form[method="dialog"]') : null;
    if (!form || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    closeDialog(form, form.querySelector('button[type="submit"]')?.value);
  });
  // Fallback for browsers/assistive technology which dispatch submit first.
  document.querySelectorAll('form[method="dialog"]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      closeDialog(form, event.submitter?.value);
    });
  });
});
