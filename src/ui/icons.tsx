import {
  Aperture, Camera, CircleDot, CloudSun, Contrast, Droplet, Eraser, Film, Leaf, Moon, Mountain, Palette, ShoppingBag,
  Smile, Sparkles, Sunrise, Sunset, Trees, UserRound, Utensils, WandSparkles, Star, type LucideIcon,
} from 'lucide-react';

/** Bộ icon duy nhất: Lucide, nét 1.75, bo tròn. */
export const STROKE = 1.75;

export const PRESET_ICONS: Record<string, LucideIcon> = {
  wand: WandSparkles, sparkles: Sparkles, user: UserRound, smile: Smile, eraser: Eraser, circleDot: CircleDot,
  aperture: Aperture, droplet: Droplet, sunset: Sunset, sunrise: Sunrise, cloudSun: CloudSun, leaf: Leaf,
  trees: Trees, mountain: Mountain, moon: Moon, utensils: Utensils, shoppingBag: ShoppingBag, film: Film,
  camera: Camera, contrast: Contrast, palette: Palette, star: Star,
};

export function PresetIcon({ name, size = 22 }: { name: string; size?: number }) {
  const I = PRESET_ICONS[name] ?? Sparkles;
  return <I size={size} strokeWidth={STROKE} aria-hidden />;
}
