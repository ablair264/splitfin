import { useRef, useCallback } from "react"

interface SidebarAnimatedIconProps {
  icon: React.ForwardRefExoticComponent<any>
  size?: number
  className?: string
}

export function SidebarAnimatedIcon({ icon: Icon, size = 18, className = "" }: SidebarAnimatedIconProps) {
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null)

  const handleMouseEnter = useCallback(() => {
    iconRef.current?.startAnimation()
  }, [])

  const handleMouseLeave = useCallback(() => {
    iconRef.current?.stopAnimation()
  }, [])

  return (
    <span
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`flex-shrink-0 ${className}`}
    >
      <Icon ref={iconRef} size={size} />
    </span>
  )
}
