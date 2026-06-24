import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '../../../components/IconButton.jsx';

const MENU_GAP = 6;
const VIEWPORT_PADDING = 12;

function menuPosition(button, menu) {
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu?.getBoundingClientRect();
  const width = menuRect?.width ?? 192;
  const left = Math.min(
    Math.max(VIEWPORT_PADDING, buttonRect.right - width),
    window.innerWidth - width - VIEWPORT_PADDING,
  );

  return {
    top: buttonRect.bottom + MENU_GAP,
    left,
  };
}

export function ConversationOptionsMenu({ name, items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    setPosition(menuPosition(buttonRef.current, menuRef.current));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function closeIfOutside(event) {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    function closeOnViewportMove() {
      setOpen(false);
    }

    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportMove);
    window.addEventListener('scroll', closeOnViewportMove, true);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportMove);
      window.removeEventListener('scroll', closeOnViewportMove, true);
    };
  }, [open]);

  function runAction(action) {
    setOpen(false);
    action?.();
  }

  const menu = open ? (
    <div
      className="conversation-options-menu"
      id={menuId}
      role="menu"
      ref={menuRef}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className="conversation-options-item"
            disabled={item.disabled}
            data-tone={item.tone}
            onClick={() => runAction(item.onSelect)}
          >
            {Icon ? (
              <Icon
                className="conversation-options-icon"
                aria-hidden="true"
                size={16}
                strokeWidth={2.2}
              />
            ) : null}
            <span className="conversation-options-copy">
              <span>{item.label}</span>
              {item.description ? <small>{item.description}</small> : null}
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="conversation-options">
      <IconButton
        ref={buttonRef}
        className="conversation-options-button"
        icon={MoreHorizontal}
        label={`More options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      />
      {open ? createPortal(menu, document.body) : null}
    </div>
  );
}
