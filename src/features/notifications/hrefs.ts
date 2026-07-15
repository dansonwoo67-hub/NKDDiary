export type NotificationHrefInput = {
  type: string;
  letterDate?: string | null;
  letterId?: string | null;
  annotationId?: string | null;
};

export function buildNotificationHref(input: NotificationHrefInput) {
  if (!input.letterDate || !input.letterId) return "/";
  const query = `?letter=${encodeURIComponent(input.letterId)}`;
  const hash = input.annotationId ? `#annotation-${encodeURIComponent(input.annotationId)}` : "";
  return `/letters/${input.letterDate}${query}${hash}`;
}
