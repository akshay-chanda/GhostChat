const { schedule, cancel } = require('../../src/services/expirationService');

describe('expirationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('calls onExpire once the expiresAt timestamp is reached', () => {
    const onExpire = jest.fn();
    const expiresAt = new Date(Date.now() + 5000).toISOString();

    schedule('room-1', expiresAt, onExpire);
    expect(onExpire).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not fire early', () => {
    const onExpire = jest.fn();
    schedule('room-2', new Date(Date.now() + 10_000).toISOString(), onExpire);

    jest.advanceTimersByTime(9999);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('cancel() prevents a scheduled expiration from firing', () => {
    const onExpire = jest.fn();
    schedule('room-3', new Date(Date.now() + 5000).toISOString(), onExpire);

    cancel('room-3');
    jest.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('scheduling again for the same room replaces the previous timer instead of stacking', () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();

    schedule('room-4', new Date(Date.now() + 5000).toISOString(), firstCallback);
    // Extending expiration re-schedules — the old timer must be
    // cleared, or firstCallback would fire at the original 5s mark
    // in addition to secondCallback firing at the new 10s mark.
    schedule('room-4', new Date(Date.now() + 10_000).toISOString(), secondCallback);

    jest.advanceTimersByTime(5000);
    expect(firstCallback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('treats an expiresAt already in the past as due immediately, not negative delay', () => {
    const onExpire = jest.fn();
    schedule('room-5', new Date(Date.now() - 5000).toISOString(), onExpire);

    jest.advanceTimersByTime(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('a failing onExpire callback does not throw out of schedule()', () => {
    const throwingCallback = jest.fn(() => {
      throw new Error('boom');
    });
    expect(() => {
      schedule('room-6', new Date(Date.now() + 1000).toISOString(), throwingCallback);
      jest.advanceTimersByTime(1000);
    }).not.toThrow();
    expect(throwingCallback).toHaveBeenCalledTimes(1);
  });
});
