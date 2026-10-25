import React from 'react';

import getProxyFormState from './logic/getProxyFormState';
import cloneObject from './utils/cloneObject';
import deepEqual from './utils/deepEqual';
import get from './utils/get';
import isUndefined from './utils/isUndefined';
import set from './utils/set';
import type {
  FieldValues,
  FormState,
  UseFormStateProps,
  UseFormStateReturn,
} from './types';
import { useFormControlContext } from './useFormControlContext';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';
import { useResyncOnReconnect } from './useResyncOnReconnect';

/**
 * Subscribes to form state with re-renders isolated to this hook.
 * Optionally scope to specific field names to minimize re-render surface.
 *
 * @see [API](https://react-hook-form.com/docs/useformstate)
 *
 * @example
 * ```tsx
 * const { errors, isDirty } = useFormState({ control, name: "email" });
 * ```
 */
export function useFormState<
  TFieldValues extends FieldValues = FieldValues,
  TTransformedValues = TFieldValues,
>(
  props?: UseFormStateProps<TFieldValues, TTransformedValues>,
): UseFormStateReturn<TFieldValues> {
  const formControl = useFormControlContext<
    TFieldValues,
    unknown,
    TTransformedValues
  >();
  const { control = formControl, disabled, name, exact } = props || {};

  const getCurrentFormState = () => ({
    ...control._formState,
    defaultValues:
      control._defaultValues as FormState<TFieldValues>['defaultValues'],
  });

  const [formState, updateFormState] =
    React.useState<FormState<TFieldValues>>(getCurrentFormState);
  const _localProxyFormState = React.useRef({
    isDirty: false,
    isLoading: false,
    dirtyFields: false,
    touchedFields: false,
    validatingFields: false,
    isValidating: false,
    isValid: false,
    errors: false,
  });
  const _formStateRef = React.useRef(formState);
  const _wasDisabled = React.useRef(!!disabled);

  _formStateRef.current = formState;

  // `reset()` replaces `control._defaultValues`, so the resync snapshot keeps
  // that reference instead of deep-cloning the whole form. With `name` (every
  // Controller), only those field-map branches are cloned (#13944).
  const getResyncFormState = (): FormState<TFieldValues> => {
    const formState = getCurrentFormState();
    const names = getFieldNames(name);

    if (!names) {
      return formState;
    }

    return {
      ...formState,
      errors: scopeFieldMap(formState.errors, names),
      dirtyFields: scopeFieldMap(formState.dirtyFields, names),
      touchedFields: scopeFieldMap(formState.touchedFields, names),
      validatingFields: scopeFieldMap(formState.validatingFields, names),
    };
  };

  const { resyncIfNeeded, snapshot } = useResyncOnReconnect(
    disabled ? undefined : getResyncFormState,
    cloneFormStateForResync,
  );

  useIsomorphicLayoutEffect(() => {
    // A disabled subscription never seeds a snapshot. Catch up once it turns
    // back on, which is what that seed used to make possible.
    if (!disabled && _wasDisabled.current) {
      const currentFormState = getCurrentFormState();

      if (!deepEqual(_formStateRef.current, currentFormState)) {
        updateFormState(currentFormState);
      }
    }

    _wasDisabled.current = !!disabled;

    resyncIfNeeded(!disabled, getResyncFormState, () => {
      updateFormState(getCurrentFormState());
    });

    const unsubscribe = control._subscribe({
      name,
      formState: _localProxyFormState.current,
      exact,
      callback: (formState) => {
        !disabled &&
          updateFormState({
            ...control._formState,
            ...formState,
            defaultValues:
              control._defaultValues as FormState<TFieldValues>['defaultValues'],
          });
      },
    });

    return () => {
      unsubscribe();
      snapshot(!disabled, getResyncFormState);
    };
  }, [control, name, disabled, exact, resyncIfNeeded, snapshot]);

  React.useEffect(() => {
    _localProxyFormState.current.isValid && control._setValid(true);
  }, [control]);

  return React.useMemo(
    () =>
      getProxyFormState(
        formState,
        control,
        _localProxyFormState.current,
        false,
      ),
    [formState, control],
  );
}

function getFieldNames(
  name: UseFormStateProps<FieldValues>['name'],
): readonly string[] | undefined {
  if (name == null) {
    return undefined;
  }

  return (Array.isArray(name) ? name : [name]) as readonly string[];
}

function scopeFieldMap<T>(fieldMap: T, names: readonly string[]): T {
  const scoped: Record<string, unknown> = {};

  for (const fieldName of names) {
    const value = get(fieldMap, fieldName);

    if (!isUndefined(value)) {
      // Copy the branch so a later `set` for a child path cannot write
      // through to the live field map.
      set(scoped, fieldName, cloneObject(value));
    }
  }

  return scoped as T;
}

function cloneFormStateForResync<TFieldValues extends FieldValues>(
  formState: FormState<TFieldValues>,
): FormState<TFieldValues> {
  return {
    ...formState,
    errors: cloneObject(formState.errors),
    dirtyFields: cloneObject(formState.dirtyFields),
    touchedFields: cloneObject(formState.touchedFields),
    validatingFields: cloneObject(formState.validatingFields),
    defaultValues: formState.defaultValues,
  };
}
