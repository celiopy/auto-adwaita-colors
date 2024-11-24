import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { fetchLatestVersion, getVariant } from './utils.js'; // Adjust path as needed

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const ACCENT_COLOR = 'accent-color';
const ICON_THEME = 'icon-theme';
const CHECK_INTERVAL = 3600; // Check every hour (in seconds)

let notificationSource = null;

const NotificationPolicy = GObject.registerClass(
    class NotificationPolicy extends MessageTray.NotificationPolicy {
        get enable() { return true; }
        get enableSound() { return true; }
        get showBanners() { return true; }
        get forceExpanded() { return false; }
        get showInLockScreen() { return false; }
        get detailsInLockScreen() { return false; }
    }
);

function getNotificationSource() {
    if (!notificationSource) {
        const notificationPolicy = new NotificationPolicy();

        notificationSource = new MessageTray.Source({
            title: _('Auto Adwaita Colors'),
            icon: new Gio.ThemedIcon({ name: 'dialog-information' }),
            iconName: 'dialog-information',
            policy: notificationPolicy,
        });

        notificationSource.connect('destroy', _source => {
            notificationSource = null;
        });

        Main.messageTray.add(notificationSource);
    }

    return notificationSource;
}

export default class AccentColorExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._syncAccentColorId = null;
        this._accentColorChangedId = null;
        this._updateCheckTimer = null;
    }

    enable() {
        this.settingsSchema = new Gio.Settings({ schema: INTERFACE_SCHEMA });
        this._settings = this.getSettings();

        // Connect to the accent-color setting change event and store the ID
        this._syncAccentColorId = this.settingsSchema.connect(
            'changed::' + ACCENT_COLOR,
            this._syncAccentColor.bind(this)
        );

        // Connect to the accent-color setting change event and store the ID
        this._accentColorChangedId = this._settings.connect(
            'changed::' + ACCENT_COLOR,
            this._onAccentColorChanged.bind(this)
        );

        // Get the initial accent color and apply the corresponding icon theme
        this._syncAccentColor();
        this._onAccentColorChanged();

        // Start the periodic update check
        this._startUpdateCheck();
        this._checkForUpdates();
    }

    disable() {
        // Reset the icon-theme when the extension is disabled
        this.settingsSchema.set_string(ICON_THEME, 'Adwaita');

        // Disconnect the signal using the stored ID
        if (this._syncAccentColorId !== null) {
            this.settingsSchema.disconnect(this._syncAccentColor);
            this._syncAccentColorId = null;
        }

        if (this._accentColorChangedId !== null) {
            this._settings.disconnect(this._onAccentColorChanged);
            this._accentColorChangedId = null;
        }

        if (this._updateCheckTimer) {
            GLib.source_remove(this._updateCheckTimer);
            this._updateCheckTimer = null;
        }

		this._settings = null;
		this.settingsSchema = null;
    }

    _syncAccentColor() {
        // Sync settings between global schema and _settings
        this._settings.set_string(ACCENT_COLOR, this.settingsSchema.get_string(ACCENT_COLOR));
    }

    _onAccentColorChanged() {
        // When the accent color changes, get the new color and update the icon theme
        let accentColor = this._settings.get_string(ACCENT_COLOR);
        this._setIconTheme(accentColor);
    }

    async _setIconTheme(color) {
        if (color) {
            let iconTheme = `Adwaita-${color}`;

            const { found } = getVariant(iconTheme);

            if (found) {
                await this._loopAndUpdate(iconTheme);
                this.settingsSchema.set_string(ICON_THEME, iconTheme);
            } else {
                this.settingsSchema.set_string(ICON_THEME, 'Adwaita');
                this._sendNotification({
                    title: _('Icon Theme Not Found'),
                    body: _('The selected icon theme is not installed. Please install it through the preferences page.'),
                    onActivate: () => this.openPreferences(),
                });
            }
        }
    }

    async _loopAndUpdate(iconTheme) {
        let directories = [GLib.get_home_dir(), '/var'];
        let file = Gio.File.new_for_path(GLib.get_home_dir());

        for (let dirPath of directories) {
            // Initialize counters
            let fileCount = 0;
            let dirCount = 0;

            // Get the contents of the directory
            let enumerator = file.enumerate_children('standard::*,metadata::*',
              Gio.FileQueryInfoFlags.NONE,
              null);
            let info;


            // Iterate through the contents
            while ((info = await enumerator.next_file(null)) !== null) {
                await this._updateIcon(info, iconTheme, dirPath);

                // Count files and directories
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    dirCount++;
                    // Recursively process directories if needed
                } else {
                    fileCount++;
                }
            }

            // Log the counts
            console.log(`Files: ${fileCount}, Directories: ${dirCount}`);
        }
    }

    async _updateIcon(fileInfo, iconTheme, parentDir) {
        let file = Gio.File.new_for_path(parentDir);
        let childFile = file.get_child(fileInfo.get_name());

        try {
            let iconValue = fileInfo.get_attribute_string('metadata::custom-icon');

            const regex = /Adwaita-(\w+)(?=\/)/;
            if (regex.test(iconValue)) {
                let newIconValue = iconValue.replace(regex, iconTheme);
                childFile.set_attribute_string(
                    'metadata::custom-icon', 
                    newIconValue,
                    Gio.FileAttributeType.STRING,
                    null
                );

                console.log(`Updated icon to ${newIconValue}`);
            }
        } catch (e) {
            console.log(`Error updating icon: ${e.message}`);
        }
    }

    _startUpdateCheck() {
        // Set up a periodic function to check for updates
        this._updateCheckTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, CHECK_INTERVAL, () => {
                this._checkForUpdates().catch(error => {
                    logError(error, 'Periodic update check failed');
                });
                return GLib.SOURCE_CONTINUE; // Continue the timer
            }
        );
    }

    async _checkForUpdates() {
        if (! this._settings.get_boolean('notify-about-releases')) 
            return;

        try {
            const latestVersion = await fetchLatestVersion();
            if (latestVersion) {
                const currentVersion = this._settings.get_string('current-version');
                if (currentVersion !== latestVersion) {
                    this._sendNotification({
                        title: _('Update Available'),
                        body: _('A new version of Adwaita-Colors is available.'),
                        onActivate: () => this.openPreferences(),
                    });
                }
            }
        } catch (error) {
            logError(error, 'Error checking for updates');
        }
    }

    _sendNotification({ title, body, icon = 'dialog-information', urgency = MessageTray.Urgency.NORMAL, onActivate }) {
        const source = getNotificationSource();
        const notification = new MessageTray.Notification({
            source: source,
            title: title,
            body: body,
            gicon: new Gio.ThemedIcon({ name: icon }),
            iconName: icon,
            urgency: urgency,
        });

        if (onActivate) {
            notification.connect('activated', onActivate);
        }

        source.addNotification(notification);
    }
}

