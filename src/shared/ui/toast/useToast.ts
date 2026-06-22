import { useToast as useArchToast } from '@archora/ui';
import type { ArchToastAction, ArchToastInput, ArchToastVariant } from '@archora/ui';

export type ToastTone = ArchToastVariant;
export type ToastAction = ArchToastAction;

type ToastInput = Omit<ArchToastInput, 'variant'> & {
  tone?: ToastTone;
  variant?: ArchToastVariant;
};

function toArchInput(input: ToastInput): ArchToastInput {
  const { tone, variant, ...rest } = input;
  return { ...rest, variant: variant ?? tone ?? 'info' };
}

export function useToast() {
  const toast = useArchToast();

  return {
    toasts: toast.toasts,
    dismiss: toast.dismiss,
    clear: toast.clear,
    show: (input: ToastInput) => toast.show(toArchInput(input)),
    push: (input: ToastInput) => toast.push(toArchInput(input)),
    info: toast.info,
    success: toast.success,
    warning: toast.warning,
    danger: toast.danger,
  };
}
