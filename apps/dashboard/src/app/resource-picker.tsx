"use client";

import { useState } from "react";

export interface ResourceOption {
  readonly id: string;
  readonly name: string;
  readonly parentName?: string;
}

export function ResourcePicker({
  emptyMessage,
  kind,
  label,
  name,
  options,
  value,
}: Readonly<{
  emptyMessage: string;
  kind: "channel" | "role";
  label: string;
  name: string;
  options: readonly ResourceOption[];
  value: readonly string[];
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(value));
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const visibleOptions = options.filter((option) =>
    [option.name, option.parentName]
      .filter(Boolean)
      .some((part) =>
        part?.toLocaleLowerCase("ru-RU").includes(normalizedQuery),
      ),
  );
  const selectedOptions = options.filter((option) => selected.has(option.id));
  const unavailableCount = [...selected].filter(
    (id) => !options.some((option) => option.id === id),
  ).length;
  const summary =
    selectedOptions.length === 0 && unavailableCount === 0
      ? "Не выбрано"
      : selectedOptions.length === 0
        ? `Недоступных объектов: ${unavailableCount}`
        : [
            ...selectedOptions.slice(0, 2).map((option) => option.name),
            selectedOptions.length + unavailableCount > 2
              ? `ещё ${selectedOptions.length + unavailableCount - 2}`
              : undefined,
          ]
            .filter(Boolean)
            .join(", ");

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <fieldset className="resourcePicker">
      <legend>{label}</legend>
      {[...selected].map((id) => (
        <input key={id} name={name} type="hidden" value={id} />
      ))}
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="resourcePickerTrigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{summary}</span>
        <span aria-hidden="true" className="resourcePickerMark">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="resourcePickerPanel">
          <input
            aria-label={`Найти ${kind === "role" ? "роль" : "канал"}`}
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={kind === "role" ? "Найти роль…" : "Найти канал…"}
            type="search"
            value={query}
          />
          <div className="resourcePickerOptions" role="listbox">
            {visibleOptions.map((option) => (
              <label
                aria-selected={selected.has(option.id)}
                className="resourcePickerOption"
                key={option.id}
                role="option"
              >
                <input
                  checked={selected.has(option.id)}
                  onChange={() => toggle(option.id)}
                  type="checkbox"
                />
                <span aria-hidden="true" className="resourcePrefix">
                  {kind === "role" ? "@" : "#"}
                </span>
                <span>
                  <strong>{option.name}</strong>
                  {option.parentName ? (
                    <small>{option.parentName}</small>
                  ) : null}
                </span>
              </label>
            ))}
            {visibleOptions.length === 0 ? (
              <p className="resourcePickerEmpty">
                {options.length === 0 ? emptyMessage : "Совпадений нет."}
              </p>
            ) : null}
          </div>
          <div aria-live="polite" className="resourcePickerCount">
            Выбрано: {selected.size}
            {unavailableCount > 0
              ? ` · недоступных объектов: ${unavailableCount}`
              : ""}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
