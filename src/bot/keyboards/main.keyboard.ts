import { Keyboard } from "grammy";

/**
 * Returns the toggleable reply keyboard for bottom menu navigation.
 * Uses .resized() without .persistent() so the keyboard icon stays visible next to attachment icon,
 * allowing users to freely open and close/hide the menu.
 */
export function getMainReplyKeyboard(): Keyboard {
  return new Keyboard()
    .text("🍽️ Catat Makanan")
    .text("📊 Rekap Hari Ini")
    .row()
    .text("👤 Profile")
    .text("❓ Help")
    .resized();
}
