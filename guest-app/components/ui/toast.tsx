"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle } from "lucide-react";

type ToastKind = "success" | "info" | "warning";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

type PushToast = (
  message: string,
  kind?: ToastKind,
  action?: ToastAction
) => void;

const ToastContext = createContext<PushToast>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const icons = {
  success: <CheckCircle2 className="size-4 text-sage" />,
  info: <Info className="size-4 text-saffron" />,
  warning: <AlertTriangle className="size-4 text-danger" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback<PushToast>(
    (message, kind = "info", action) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, kind, action }]);
      // Actionable toasts linger a little longer so the action is reachable.
      setTimeout(() => dismiss(id), action ? 5200 : 3200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-6 z-50 flex flex-col items-center gap-2 px-4"
      >
        {/* Toasts render outside the route template, so they need their own
            reduced-motion opt-in. */}
        <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="glass-dark pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm text-white"
            >
              {icons[t.kind]}
              {t.message}
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="ml-1 font-semibold text-saffron underline-offset-2 hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        </MotionConfig>
      </div>
    </ToastContext.Provider>
  );
}
