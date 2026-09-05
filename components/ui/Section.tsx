/**
 * Section header — mono number + wide-tracked uppercase title + hairline rule.
 *
 *   <Section no="01" title="Infrastructure" />
 */
export default function Section({
  no,
  title,
  className = '',
}: {
  no?: string
  title: string
  className?: string
}) {
  return (
    <div className={`az-section ${className}`}>
      {no && <span className="az-section__no">{no}</span>}
      <span className="az-section__title">{title}</span>
      <span className="az-section__rule" />
    </div>
  )
}
