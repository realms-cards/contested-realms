"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export interface CustomSelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Custom select dropdown that renders consistently across all platforms.
 * Replaces native <select> elements which have OS-specific styling on Windows.
 */
export function CustomSelect({
  value,
  onChange,
  options,
  className = "",
  disabled = false,
  placeholder = "Select...",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label ?? placeholder;

  // Compute dropdown position when opening, flip upward if near viewport bottom
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(options.length * 36, 192); // max-h-48 = 192px
      const spaceBelow = window.innerHeight - rect.bottom - 4;
      const openAbove =
        spaceBelow < estimatedHeight && rect.top > estimatedHeight;

      setDropdownPos({
        top: openAbove ? rect.top - 4 - estimatedHeight : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 160),
      });
    }
  }, [isOpen, options.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        listRef.current &&
        !listRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && listRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleResize = () => setIsOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          } else {
            setIsOpen((prev) => !prev);
          }
          break;
        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          break;
        case "ArrowDown":
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setHighlightedIndex(0);
          } else {
            setHighlightedIndex((prev) =>
              prev < options.length - 1 ? prev + 1 : prev,
            );
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }
          break;
        case "Tab":
          setIsOpen(false);
          break;
      }
    },
    [disabled, isOpen, highlightedIndex, options, onChange],
  );

  // Reset highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const highlightedElement = listRef.current.children[
        highlightedIndex
      ] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, highlightedIndex]);

  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        type="button"
        className={`
          rc-select flex h-9 w-full items-center justify-between gap-2 text-left
          hover:border-rc-line/40
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${isOpen ? "border-rc-accent-ring shadow-[0_0_0_1px_#f3cf6a]" : ""}
        `}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-rc-fg-subtle transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown menu rendered via portal to escape overflow containers */}
      {isOpen &&
        dropdownPos &&
        createPortal(
          <div
            ref={listRef}
            className="
              thin-scrollbar fixed z-[9999] max-h-48 overflow-y-auto
              rounded-rc-md border border-rc-line/22 bg-[#111a2e] py-1
              shadow-rc-md
            "
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
            role="listbox"
          >
            {options.map((option, index) => (
              <div
                key={option.value || "__none__"}
                className={`
                  cursor-pointer px-3 py-1.5 font-rc-mono text-[13px]
                  transition-colors duration-100
                  ${option.value === value ? "text-rc-accent-link" : "text-rc-fg"}
                  ${highlightedIndex === index ? "bg-rc-accent/12 text-rc-fg-strong" : ""}
                  hover:bg-rc-accent/12
                `}
                onClick={() => handleOptionClick(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                role="option"
                aria-selected={option.value === value}
              >
                {option.label}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default CustomSelect;
