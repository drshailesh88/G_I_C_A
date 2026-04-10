import Image from 'next/image';
import { cn } from '@/lib/utils';

export type ImageContext = 'hero' | 'card' | 'thumbnail' | 'full-width';

interface ResponsiveImageProps {
  src: string;
  alt: string;
  context: ImageContext;
  aspectRatio?: string;
  priority?: boolean;
  className?: string;
}

const SIZES_MAP: Record<ImageContext, string> = {
  hero: '100vw',
  'full-width': '(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px',
  card: '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  thumbnail: '96px',
};

export function getSizesForContext(context: ImageContext): string {
  return SIZES_MAP[context];
}

export function ResponsiveImage({
  src,
  alt,
  context,
  aspectRatio = '16/9',
  priority = false,
  className,
}: ResponsiveImageProps) {
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{ aspectRatio }}
      data-testid="responsive-image"
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={getSizesForContext(context)}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
