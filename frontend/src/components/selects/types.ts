interface SelectOption {
  value: string;
  label: string;
}

export interface SelectWithSearchProps {
  readonly options: SelectOption[];
  readonly value?: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly noResultsText?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly className?: string;
}
