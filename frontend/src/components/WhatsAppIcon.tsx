/**
 * WhatsAppIcon Component
 *
 * WHY: lucide-react (the icon set used throughout this app) has no
 * brand-specific WhatsApp glyph — MessageCircle was a generic stand-in that
 * didn't read as "WhatsApp" at a glance. This renders the recognizable
 * phone-in-speech-bubble mark so the action is instantly identifiable.
 * Uses currentColor so it picks up the same text-color classes lucide icons do.
 */

interface WhatsAppIconProps {
  size?: number;
  className?: string;
}

export default function WhatsAppIcon({ size = 18, className }: WhatsAppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.004 2C6.481 2 2.004 6.477 2.004 12c0 1.766.462 3.484 1.34 5L2 22l5.184-1.36A9.96 9.96 0 0012.004 22c5.523 0 10-4.477 10-10s-4.477-10-10-10zm0 18.16a8.15 8.15 0 01-4.15-1.14l-.298-.175-3.109.816.83-3.03-.195-.31a8.13 8.13 0 01-1.238-4.32c0-4.5 3.66-8.16 8.16-8.16 4.5 0 8.16 3.66 8.16 8.16 0 4.5-3.66 8.16-8.16 8.16z" />
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.1-.471-.15-.67.148-.197.298-.767.967-.94 1.165-.173.198-.347.223-.644.075-.297-.15-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.173.198-.297.298-.496.099-.198.05-.372-.025-.52-.075-.15-.669-1.612-.916-2.208-.242-.578-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.075-.792.372-.272.298-1.04 1.017-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.086 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.413-.074-.124-.272-.198-.57-.347z" />
    </svg>
  );
}
