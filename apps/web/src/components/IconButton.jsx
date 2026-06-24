import { forwardRef } from 'react';

export const IconButton = forwardRef(function IconButton(
  { as: Component = 'button', icon: Icon, label, className = '', children = null, ...props },
  ref,
) {
  const classes = ['icon-button', className].filter(Boolean).join(' ');
  const componentProps = Component === 'button' ? { type: 'button', ...props } : props;

  return (
    <Component ref={ref} className={classes} aria-label={label} title={label} {...componentProps}>
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2} /> : null}
      {children}
    </Component>
  );
});
