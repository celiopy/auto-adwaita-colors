import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { fetchLatestVersion, downloadZip, getVariant } from './utils.js'; // Adjust path as needed

export default class AccentColorExtensionPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Adwaita-Colors Installation'),
        });
        page.add(group);

        const descriptionLabel = new Gtk.Label({
            label: _("This extension needs Adwaita-Colors icons installed."),
            xalign: 0,
        });
        descriptionLabel.add_css_class('dim-label');
        group.add(descriptionLabel);

        const row = new Adw.ActionRow({
            title: _('Adwaita-Colors'),
            subtitle: _('Auto-installs icon themes'),
        });

        const downloadButton = new Gtk.Button({
            label: _('Download'),
            valign: Gtk.Align.CENTER,
        });

        const versionLabel = new Gtk.Label({
            label: this.getCurrentVersionLabel(window),
            xalign: 0,
            use_markup: true,
        });

        const fetchResultLabel = new Gtk.Label({
            label: _("Fetching version..."),
            xalign: 0,
        });

        row.add_suffix(downloadButton);
        row.add_suffix(versionLabel);
        group.add(row);
        group.add(fetchResultLabel);

        // Progress bar for visual feedback
        const progressBar = new Gtk.ProgressBar({
            visible: false, // Initially hidden
        });
        group.add(progressBar);

        // Fetch the latest version
        this.updateVersionLabel(fetchResultLabel);

        // Handle download
        downloadButton.connect('clicked', () => {
            this.handleDownload(window, versionLabel, progressBar);
        });

        // Add new row for notifications
        const notificationRow = new Adw.SwitchRow({
            title: _('New Release Notifications'),
            subtitle: _('Enable or disable notifications about new releases'),
            active: window._settings.get_boolean('notify-about-releases'),
        });

        // Connect the switch state change to save the setting
        notificationRow.connect('notify::active', () => {
            window._settings.set_boolean('notify-about-releases', notificationRow.get_active());
        });

        group.add(notificationRow);

        const { found, state } = getVariant();
        window._settings.set_boolean('notify-about-releases', state === 'user');
        downloadButton.set_sensitive(state === 'user');
    }

    async handleDownload(window, versionLabel, progressBar) {
        const iconsDir = `${GLib.get_home_dir()}/.local/share/icons`;
        const repoUrl = 'https://github.com/dpejoh/Adwaita-colors/archive/refs/heads/main.zip';
        const tempZipFile = GLib.get_tmp_dir() + '/adwaita-colors.zip';

        // Use metadata.path to get the extension's directory dynamically
        const scriptPath = GLib.build_filenamev([this.path, 'install_adwaita_colors.sh']);  // Construct the full path to the script

        try {
            // Show progress bar and initialize
            progressBar.set_visible(true);
            progressBar.set_fraction(0.0);
            progressBar.set_text(_("Starting..."));
            progressBar.set_show_text(true);

            const [success, pid] = GLib.spawn_async(
                null,
                ['sh', scriptPath, repoUrl, tempZipFile, iconsDir],
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null
            );

            if (success) {
                // Save the current accent color in window._settings
                const savedAccentColor = window._settings.get_string('accent-color');

                // Reset the accent color to default (blue)
                window._settings.set_string('accent-color', 'blue');

                // Monitor progress during the process
                let progress = 0.0;
                const progressInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    progress = Math.min(progress + 0.1, 1.0);
                    progressBar.set_fraction(progress);
                    progressBar.set_text(progress < 1.0 ? _("Working...") : _("Finalizing..."));
                    return progress < 1.0; // Continue updating until 100%
                });

                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
                    GLib.Source.remove(progressInterval); // Stop progress updates

                    progressBar.set_fraction(1.0);
                    progressBar.set_text(_("Completed!"));

                    fetchLatestVersion().then((latestVersion) => {
                        if (latestVersion) {
                            window._settings.set_string('current-version', latestVersion);
                            versionLabel.set_label(this.getCurrentVersionLabel(window));
                        }
                    });

                    // Restore the original accent color after the process is finished
                    window._settings.set_string('accent-color', savedAccentColor);

                    // Hide the progress bar after completion
                    progressBar.set_visible(false);
                });
            } else {
                throw new Error("Failed to spawn shell script.");
            }
        } catch (error) {
            logError(error, 'Download failed');
            progressBar.set_text(_("Error occurred"));
            progressBar.set_visible(false); // Ensure the progress bar is hidden in case of error
        }
    }

    async updateVersionLabel(fetchResultLabel) {
        const result = await fetchLatestVersion();

        fetchResultLabel.set_label(result);
        if (result && !result.startsWith("Error")) {
            fetchResultLabel.set_label(`Latest version: ${result}`);
        }
    }

    getCurrentVersionLabel(window) {
        const currentVersion = window._settings.get_string('current-version') || 'NA';
        return `<b>Current Version:</b> ${currentVersion}`;
    }
}

