import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A text field that survives being filled by the browser rather than by hand.
 *
 * A password manager writes straight into the DOM node: no `input` event, no
 * `change`, nothing React can hear. A controlled input therefore ends up with
 * a full box and an empty `useState`, and every question asked of the *state*
 * gets the wrong answer. On the login screen that showed up as a dead button —
 * the box was full of dots and „Zaloguj się" stayed greyed out, reading as a
 * broken form rather than as a field waiting for input (11.09).
 *
 * Two halves to the fix, and both are needed:
 *
 * - **`read()` at submit time takes the DOM as the truth.** Unblocking the
 *   button alone would have been worse than the bug: the form would have
 *   posted the empty *state* while the user watched a full field go through.
 * - **A mount-time sync copies whatever is already there into the state**, so
 *   the value the user can see is the value the component holds.
 *
 * What this deliberately does *not* do is gate the submit button on the value.
 * Autofill has no reliable moment — Chrome fills some fields on load and others
 * only once the page is interacted with — so a button that waits for a value it
 * cannot hear about is a button that can stay dead. Emptiness is caught at
 * submit instead, where it can be answered with a sentence.
 */
export function useAutofillableField(initial = '') {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const filled = ref.current?.value ?? '';
    if (filled !== '') setValue((current) => (current === '' ? filled : current));
  }, []);

  /** What the field actually holds right now — the node wins over the state. */
  const read = useCallback(() => ref.current?.value ?? value, [value]);

  return { ref, value, setValue, read };
}
