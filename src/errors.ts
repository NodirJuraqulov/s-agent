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
