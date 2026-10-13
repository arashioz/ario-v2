// Shared by lazy page loading and API requests. Releases are idempotent, including
// cancellation/retry paths, so a failed request cannot leave the splash stuck.
let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export const pageActivity = {
  getSnapshot: () => pending,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  begin() {
    pending++;
    emit();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      pending--;
      emit();
    };
  },
};
