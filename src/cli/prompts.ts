/**
 * Interactive Prompt Utilities
 *
 * Wrapper functions around @clack/prompts providing consistent behavior,
 * default value display, and validation.
 */

import { text, select, confirm, isCancel, cancel } from "@clack/prompts";

/**
 * Format a value as a hint string for display in prompts.
 * Used to show default values in grey text.
 */
export function formatDefaultHint(value: any): string {
  if (value === undefined || value === null) {
    return "none";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

/**
 * Prompt for a number with validation and default value display.
 * Returns string - caller should parse to number if needed.
 * 
 * If user presses enter without input, the defaultValue is returned.
 */
export async function promptNumber(
  message: string,
  options?: {
    defaultValue?: string | number;
    validator?: (v: string) => boolean | string;
    placeholder?: string;
  }
): Promise<string> {
  const { defaultValue, validator, placeholder } = options ?? {};

  const hint =
    defaultValue !== undefined ? `default: ${defaultValue}` : undefined;

  const result = await text({
    message,
    hint,
    defaultValue: String(defaultValue ?? ""),
    placeholder,
    validate: (v) => {
      // If empty and we have a default, it's valid (will use default)
      if (v.trim() === "" && defaultValue !== undefined) {
        return undefined;
      }

      // If empty and no default, require input
      if (v.trim() === "") {
        return "Value is required";
      }

      // Run custom validator if provided
      if (validator) {
        const validationResult = validator(v);
        return validationResult === true ? undefined : String(validationResult);
      }
      return undefined;
    },
  });

  if (isCancel(result)) {
    cancel("cancelled");
    throw new Error("Operation cancelled by user");
  }

  // If user pressed enter without typing, return default
  if (result.trim() === "" && defaultValue !== undefined) {
    return String(defaultValue);
  }

  return result as string;
}

/**
 * Prompt for a string with validation and default value display.
 * 
 * If user presses enter without input, the defaultValue is returned.
 */
export async function promptString(
  message: string,
  options?: {
    defaultValue?: string;
    validator?: (v: string) => boolean | string;
    placeholder?: string;
  }
): Promise<string> {
  const { defaultValue, validator, placeholder } = options ?? {};

  const hint = defaultValue !== undefined ? `default: ${defaultValue}` : undefined;

  const result = await text({
    message,
    hint,
    defaultValue,
    placeholder,
    validate: (v) => {
      // If empty and we have a default, it's valid (will use default)
      if (v.trim() === "" && defaultValue !== undefined) {
        return undefined;
      }

      // Run custom validator if provided
      if (validator) {
        const validationResult = validator(v);
        return validationResult === true ? undefined : String(validationResult);
      }
      return undefined;
    },
  });

  if (isCancel(result)) {
    cancel("cancelled");
    throw new Error("Operation cancelled by user");
  }

  // If user pressed enter without typing, return default
  if (result.trim() === "" && defaultValue !== undefined) {
    return defaultValue;
  }

  return result as string;
}

/**
 * Prompt for yes/no confirmation with default value display.
 */
export async function promptConfirm(
  message: string,
  defaultValue?: boolean
): Promise<boolean> {
  const result = await confirm({
    message,
    initialValue: defaultValue ?? false,
  });

  if (isCancel(result)) {
    cancel("cancelled");
    throw new Error("Operation cancelled by user");
  }

  return result as boolean;
}

/**
 * Prompt for a single selection from a list of options.
 */
export async function promptSelect<T>(
  message: string,
  options: Array<{ value: T; label: string; hint?: string }>,
  defaultValue?: T
): Promise<T> {
  const defaultIndex = defaultValue
    ? options.findIndex((opt) => opt.value === defaultValue)
    : 0;

  const result = await select({
    message,
    options: options.map((opt) => ({
      value: opt.value,
      label: opt.label,
      hint: opt.hint,
    })),
    initialValue: defaultIndex >= 0 ? defaultIndex : 0,
  });

  if (isCancel(result)) {
    cancel("cancelled");
    throw new Error("Operation cancelled by user");
  }

  return result as T;
}

/**
 * Prompt for comma-separated list of items with empty values allowed.
 * Returns empty array if user provides empty input.
 * 
 * If user presses enter without input, the defaultValue is returned.
 */
export async function promptCommaList(
  message: string,
  options?: {
    defaultValue?: string[];
    placeholder?: string;
  }
): Promise<string[]> {
  const { defaultValue, placeholder } = options ?? {};

  const defaultStr =
    defaultValue && defaultValue.length > 0 ? defaultValue.join(", ") : "";
  const hint =
    defaultValue && defaultValue.length > 0
      ? `default: ${defaultValue.join(", ")}`
      : "default: none";

  const result = await text({
    message,
    hint,
    defaultValue: defaultStr,
    placeholder: placeholder ?? "item1, item2, item3",
  });

  if (isCancel(result)) {
    cancel("cancelled");
    throw new Error("Operation cancelled by user");
  }

  const trimmed = (result as string).trim();
  
  // If user pressed enter without typing, return default
  if (!trimmed) {
    return defaultValue ?? [];
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
