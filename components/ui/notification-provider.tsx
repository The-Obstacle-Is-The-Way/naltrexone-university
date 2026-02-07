'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type NotificationTone = 'info' | 'success' | 'error';

type Notification = {
  id: string;
  message: string;
  tone: NotificationTone;
};

type NotifyInput = {
  message: string;
  tone?: NotificationTone;
  durationMs?: number;
};

type NotificationContextValue = {
  notify: (input: NotifyInput) => void;
  dismiss: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue>({
  notify: () => undefined,
  dismiss: () => undefined,
});

const MAX_NOTIFICATIONS = 50;

function createNotificationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

function getToastClasses(tone: NotificationTone): string {
  if (tone === 'success') {
    return 'border-success/30 bg-success/10 text-foreground';
  }

  if (tone === 'error') {
    return 'border-destructive/40 bg-destructive/10 text-foreground';
  }

  return 'border-border bg-card text-foreground';
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id),
    );
  }, []);

  const notify = useCallback(
    ({ message, tone = 'info', durationMs = 2500 }: NotifyInput) => {
      const id = createNotificationId();
      setNotifications((prev) => {
        const next = [...prev, { id, message, tone }];
        if (next.length <= MAX_NOTIFICATIONS) {
          return next;
        }

        const dropped = next.slice(0, next.length - MAX_NOTIFICATIONS);
        for (const notification of dropped) {
          const timer = timersRef.current.get(notification.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(notification.id);
          }
        }

        return next.slice(-MAX_NOTIFICATIONS);
      });

      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div
        data-testid="app-toast-region"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="w-full max-w-sm space-y-2">
          {notifications.map((notification) => (
            <output
              key={notification.id}
              data-testid="app-toast"
              role={notification.tone === 'error' ? 'alert' : 'status'}
              className={`block rounded-xl border px-4 py-3 text-sm shadow-sm ${getToastClasses(notification.tone)}`}
            >
              {notification.message}
            </output>
          ))}
        </div>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  return useContext(NotificationContext);
}
