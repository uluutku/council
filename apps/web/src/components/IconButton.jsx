export function IconButton({
  as: Component = 'button',
  icon: Icon,
  label,
  className = '',
  children = null,
  ...props
}) {
  const classes = ['icon-button', className].filter(Boolean).join(' ');
  const componentProps = Component === 'button' ? { type: 'button', ...props } : props;

  return (
    <Component className={classes} aria-label={label} title={label} {...componentProps}>
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2} /> : null}
      {children}
    </Component>
  );
}
