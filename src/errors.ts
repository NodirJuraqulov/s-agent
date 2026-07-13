/**
 * Xatoni logga yozish uchun o'qiladigan matnga aylantiradi.
 *
 * Node'ning "localhost" kabi manzillarni IPv4+IPv6 (Happy Eyeballs) orqali
 * ulanishga urinishida, ikkalasi ham rad etilsa (masalan server o'chirilgan
 * bo'lsa) xato oddiy Error emas, balki `.message` BO'SH bo'lgan
 * `AggregateError` sifatida keladi — shu holatda `.code` yoki ichidagi
 * sabab xatolarni ko'rsatamiz, aks holda log qatori foydasiz bo'sh qoladi.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message) {
      return error.message;
    }

    const code = (error as NodeJS.ErrnoException).code;
    const causes = (error as { errors?: unknown[] }).errors;

    if (Array.isArray(causes) && causes.length > 0) {
      const details = causes.map((cause) => (cause instanceof Error ? cause.message : String(cause))).join('; ');
      return code ? `${code}: ${details}` : details;
    }

    return code ?? error.name;
  }

  return String(error);
}
