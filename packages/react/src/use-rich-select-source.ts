import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorOption } from "./editors.js";
import {
  prepareRichSelectOptions,
  type RichSelectChoiceIndex,
} from "./rich-select-options.js";

type Provider = (signal?: AbortSignal) => Promise<readonly EditorOption[]>;
interface SourceState {
  key: object | null;
  provider?: Provider;
  generation: number;
  options?: readonly EditorOption[];
  error?: unknown;
  failed?: boolean;
  loading: boolean;
}
const NO_CHOICES: readonly EditorOption[] = Object.freeze([]);

/** Closed editors never fetch or inspect borrowed options. Locale changes do not refetch. */
export function useRichSelectSource({
  openKey,
  options = NO_CHOICES,
  asyncOptions,
  locale,
}: {
  openKey: object | null;
  options?: readonly EditorOption[];
  asyncOptions?: Provider;
  locale: string;
}) {
  const sequence = useRef(0);
  const currentRequest = useRef<AbortController | null>(null);
  const [generation, setGeneration] = useState(0);
  const [remote, setRemote] = useState<SourceState>({
    key: null,
    generation: -1,
    loading: false,
  });
  useEffect(() => {
    if (!openKey || !asyncOptions) {
      setRemote((previous) =>
        previous.key === null
          ? previous
          : { key: null, generation: -1, loading: false },
      );
      return;
    }
    const request = ++sequence.current,
      abort = new AbortController();
    currentRequest.current = abort;
    let active = true;
    const current = { key: openKey, provider: asyncOptions, generation };
    setRemote({ ...current, loading: true });
    Promise.resolve()
      .then(() => {
        if (!active || request !== sequence.current || abort.signal.aborted)
          throw new DOMException("Choice request cancelled", "AbortError");
        return asyncOptions(abort.signal);
      })
      .then((loaded) => {
        if (!active || request !== sequence.current || abort.signal.aborted)
          return;
        // Own provider records before retaining them. Search indexes can then be
        // rebuilt for another locale without another request or borrowed mutation.
        const owned = prepareRichSelectOptions(loaded).options;
        setRemote({ ...current, loading: false, options: owned });
      })
      .catch((error: unknown) => {
        if (!active || request !== sequence.current || abort.signal.aborted)
          return;
        setRemote({ ...current, loading: false, error, failed: true });
      });
    return () => {
      active = false;
      abort.abort();
      if (currentRequest.current === abort) currentRequest.current = null;
    };
  }, [openKey, asyncOptions, generation]);
  const matches =
    remote.key === openKey &&
    remote.provider === asyncOptions &&
    remote.generation === generation;
  const source = asyncOptions
    ? matches
      ? remote.options
      : undefined
    : options;
  const prepared = useMemo<{
    index?: RichSelectChoiceIndex;
    error?: unknown;
    failed?: boolean;
  }>(() => {
    if (!openKey || !source) return {};
    try {
      return { index: prepareRichSelectOptions(source, locale) };
    } catch (error: unknown) {
      return { error, failed: true };
    }
  }, [openKey, source, locale, generation]);
  const identity = useMemo(
    () => ({ openKey, source, asyncOptions, generation }),
    [openKey, source, asyncOptions, generation],
  );
  return {
    index: prepared.index,
    loading: Boolean(openKey && asyncOptions && (!matches || remote.loading)),
    error: openKey
      ? (prepared.error ?? (asyncOptions && matches ? remote.error : undefined))
      : undefined,
    failed: Boolean(
      openKey &&
      (prepared.failed || (asyncOptions && matches && remote.failed)),
    ),
    identity,
    retry: useCallback(() => setGeneration((value) => value + 1), []),
    cancel: useCallback(() => currentRequest.current?.abort(), []),
  };
}
