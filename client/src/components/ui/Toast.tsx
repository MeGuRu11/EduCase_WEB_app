import { Toaster, toast } from 'sonner';

export function ToastViewport() {
  return <Toaster position="bottom-right" richColors closeButton />;
}

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast.warning(message),
  info: (message: string) => toast.info(message),
};
