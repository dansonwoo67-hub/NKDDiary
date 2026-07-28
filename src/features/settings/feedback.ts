type FeedbackState = {
  ok: boolean;
  message: string;
};

export function getSettingsFeedback(
  localMessage: string,
  actionStates: FeedbackState[],
): string {
  if (localMessage) return localMessage;
  return actionStates.find((state) => state.message)?.message ?? "";
}
