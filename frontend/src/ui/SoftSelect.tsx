import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SoftSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SoftSelectProps {
  value: string;
  options: SoftSelectOption[];
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  minMenuWidth?: number;
  align?: 'left' | 'right';
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

interface MenuPosition {
  top: number;
  left: number;
  minWidth: number;
  openUpward: boolean;
}

export const SoftSelect: React.FC<SoftSelectProps> = ({
  value,
  options,
  onChange,
  size = 'sm',
  icon,
  placeholder = '',
  disabled = false,
  title,
  ariaLabel,
  minMenuWidth = 150,
  align = 'left',
  fullWidth = false,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [menuPos, setMenuPos] = useState<MenuPosition>({
    top: 0,
    left: 0,
    minWidth: minMenuWidth,
    openUpward: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIdx >= 0 ? options[selectedIdx] : undefined;

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, minMenuWidth);
    const estItemHeight = size === 'sm' ? 29 : 32;
    const estHeight = Math.min(280, options.length * estItemHeight + 12);

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estHeight + 12 && rect.top > spaceBelow;
    const top = openUpward ? Math.max(8, rect.top - estHeight - 6) : rect.bottom + 5;

    let left = align === 'right' ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    setMenuPos({
      top,
      left,
      minWidth: width,
      openUpward,
    });
  }, [align, minMenuWidth, options.length, size]);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
  }, [open, computePosition, selectedIdx]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= options.length ? 0 : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? Math.max(0, options.length - 1) : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(0, options.length - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const opt = options[activeIndex];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    const handleScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      setOpen(false);
    };

    const handleResize = () => setOpen(false);

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, options, activeIndex, onChange]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const isSm = size === 'sm';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pulsares-soft-trigger"
        data-open={open ? 'true' : undefined}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel || title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isSm ? 5 : 8,
          height: isSm ? 26 : 34,
          padding: isSm ? '0 8px' : '0 10px',
          borderRadius: isSm ? 7 : 8,
          border: '1px solid var(--border-subtle)',
          backgroundColor: isSm ? 'var(--bg-app)' : 'var(--bg-surface)',
          color: 'var(--text-primary)',
          fontSize: isSm ? 11.5 : 12.5,
          fontWeight: 500,
          width: fullWidth ? '100%' : undefined,
          minWidth: 0,
          cursor: disabled ? 'not-allowed' : 'default',
          opacity: disabled ? 0.55 : 1,
          userSelect: 'none',
          '--wails-draggable': 'no-drag',
          ...style,
        } as React.CSSProperties}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {icon && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: open ? 'var(--accent)' : 'var(--text-secondary)',
                flexShrink: 0,
                transition: 'color 0.15s ease',
              }}
            >
              {icon}
            </span>
          )}
          {selectedOption?.icon && (
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {selectedOption.icon}
            </span>
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: selectedOption ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          size={isSm ? 12 : 14}
          style={{
            color: open ? 'var(--accent)' : 'var(--text-muted)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease',
          }}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel || title}
            className="pulsares-dropdown-menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.minWidth,
              maxWidth: 340,
              maxHeight: 280,
              overflowY: 'auto',
              padding: 5,
              zIndex: 11000,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              transformOrigin: menuPos.openUpward ? 'bottom center' : 'top center',
            }}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === activeIndex;
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  className="pulsares-dropdown-item"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    width: '100%',
                    padding: isSm ? '5px 8px' : '6px 10px',
                    fontSize: isSm ? 11.5 : 12.5,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    backgroundColor: isSelected
                      ? 'var(--bg-selected)'
                      : isHighlighted
                        ? 'var(--bg-surface-hover)'
                        : 'transparent',
                    textAlign: 'left',
                    cursor: opt.disabled ? 'not-allowed' : 'default',
                    opacity: opt.disabled ? 0.45 : 1,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {opt.icon && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                        {opt.icon}
                      </span>
                    )}
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </span>
                  </span>
                  <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                    {isSelected && <Check size={13} style={{ color: 'var(--accent)' }} />}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};

