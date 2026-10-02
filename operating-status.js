/* DEV-025: readiness labels for SATCOM operating cards.
   A stored browser key is not a provider check. Green "live" is only a successful check. */
(function (root) {
  const OWNER = 'Operations lead';

  function integrationLabel({ stored = false, check = null } = {}) {
    if (check && check.ok === true) return 'Checked';
    if (check && check.ok === false) return 'Unavailable';
    if (stored) return 'Stored · unchecked';
    return 'Unchecked';
  }

  function dotClass({ stored = false, check = null } = {}) {
    if (check && check.ok === true) return 'live';
    if (check && check.ok === false) return 'unavailable';
    if (stored) return 'stored';
    return '';
  }

  function subscriberText(count) {
    return Number.isFinite(count) ? Number(count).toLocaleString('en-US') : '—';
  }

  function formatCheckedAt(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function dotTitle(state) {
    if (state === 'live') return 'Provider check succeeded';
    if (state === 'unavailable') return 'Provider check failed';
    if (state === 'stored') return 'Key stored in this browser. Not a provider check.';
    return 'Not checked';
  }

  root.SATCOM_OPERATING = {
    OWNER,
    integrationLabel,
    dotClass,
    subscriberText,
    formatCheckedAt,
    dotTitle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
