import { api } from '@/api/endpoints';
import { useMutation } from '@tanstack/react-query';

/**
 * Checks a discount code. Deliberately not a query: a code's validity can
 * change (it is single-use, marked when the order is created), so caching the
 * answer would show a spent code as usable.
 */
export function useValidateDiscountCode() {
  return useMutation({
    mutationFn: (code: string) => api.validateDiscountCode(code),
  });
}
