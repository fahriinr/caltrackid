import { Keyboard } from "grammy";

/**
 * Returns the persistent reply keyboard for bottom menu navigation.
 * Buttons:
 * Row 1: [🍽️ Catat Makanan] [📊 Rekap Hari Ini]
 * Row 2: [👤 Profile] [❓ Help]
 */
export function getMainReplyKeyboard(): Keyboard {
  return new Keyboard()
    .text("🍽️ Catat Makanan")
    .text("📊 Rekap Hari Ini")
    .row()
    .text("👤 Profile")
    .text("❓ Help")
    .resized()
    .persistent();
}
