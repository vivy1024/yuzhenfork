export interface ComposerCaretState {
  readonly visible: boolean;
  readonly shouldAnimate: boolean;
}

export function resolveComposerCaretState(params: {
  readonly inputValue: string;
  readonly isSubmitting: boolean;
  readonly blinkTick: number;
}): ComposerCaretState {
  if (params.isSubmitting) {
    return {
      visible: false,
      shouldAnimate: false,
    };
  }

  if (!params.inputValue) {
    return {
      visible: true,
      shouldAnimate: false,
    };
  }

  if (params.blinkTick >= 2) {
    return {
      visible: true,
      shouldAnimate: false,
    };
  }

  return {
    visible: params.blinkTick % 2 === 0,
    shouldAnimate: true,
  };
}
