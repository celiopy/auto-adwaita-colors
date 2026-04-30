import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export async function fetchLatestVersion() {
    try {
        const url = 'https://api.github.com/repos/dpejoh/Adwaita-colors/releases/latest';
        const session = new Soup.Session();
        const message = Soup.Message.new('GET', url);
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        const decoder = new TextDecoder('utf-8');
        const body = decoder.decode(bytes.get_data());
        const json = JSON.parse(body);
        return json.tag_name || json.name || null;
    } catch (error) {
        logError(error, 'Failed to fetch latest version');
        return `Error: ${error.message}`;
    }
}

export async function downloadZip(url, outputPath) {
    try {
        const session = new Soup.Session();
        const message = Soup.Message.new('GET', url);
        const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        const file = Gio.File.new_for_path(outputPath);
        file.replace_contents(bytes.get_data(), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        return true;
    } catch (error) {
        logError(error, 'Failed to download zip');
        return false;
    }
}

export function getVariant() {
    try {
        const [success, stdout] = GLib.spawn_command_line_sync('flatpak --user list');
        if (success) {
            return { found: true, state: 'user' };
        }
    } catch (e) {
        // Flatpak not installed or not in PATH
    }

    try {
        const [success] = GLib.spawn_command_line_sync('flatpak list');
        if (success) {
            return { found: true, state: 'system' };
        }
    } catch (e) {
        // Flatpak not available
    }

    return { found: false, state: 'none' };
}
