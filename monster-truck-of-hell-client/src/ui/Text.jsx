// Roblox-style outlined text: a stroked copy behind a filled copy (works with gradient fills).
export function T({ children, size, color = '#fff', stroke = '#1b1b2b', sw = 3, gradient, font, className = '', style }) {
  const text = String(children ?? '');
  const fill = gradient
    ? { backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
    : { color };
  return (
    <span
      className={`otext ${font === 'title' ? 'f-title' : font === 'label' ? 'f-label' : ''} ${className}`}
      style={{ fontSize: size, '--sw': `${sw * 2}px`, '--sc': stroke, ...style }}
      data-text={text}
    >
      <span className="otext-fill" style={fill}>{text}</span>
    </span>
  );
}
