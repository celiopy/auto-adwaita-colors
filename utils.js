import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

async function execCommunicate(argv, input = null, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE;

    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    const proc = new Gio.Subprocess({argv, flags});
    proc.init(cancellable);

    if (cancellable instanceof Gio.Cancellable)
        cancelId = cancellable.connect(() => proc.force_exit());

    try {
        const [stdout, stderr] = await proc.communicate_utf8_async(input, null);

        const status = proc.get_exit_status();

        if (status !== 0) {
            throw new Gio.IOErrorEnum({
                code: Gio.IOErrorEnum.FAILED,
                message: stderr ? stderr.trim() : `Command '${argv}' failed with exit code ${status}`,
            });
        }

        return stdout.trim();
    } finally {
        if (cancelId > 0)
            cancellable.disconnect(cancelId);
    }
}

/**
 * Fetch the latest version tag from the GitHub API.
 *
 * @returns {Promise<string>} - The latest version tag or 'Unknown' on failure
 */
async function fetchLatestVersion() {
    const argv = [
        'sh', '-c', 'curl -s https://api.github.com/repos/dpejoh/Adwaita-colors/releases/latest | grep -o \'"tag_name": "[^"]*\' | sed \'s/"tag_name": "//\''
    ];

    try {
        const result = await execCommunicate(argv);
        return result.trim();
    } catch (error) {
        return `Error fetching version: ${error.message}`;
    }
}

/**
 * Downloads a ZIP file from the given URL to the specified destination.
 * 
 * @param {string} url - The URL of the ZIP file to download.
 * @param {string} destPath - The destination file path to save the downloaded ZIP.
 * @returns {Promise<void>} Resolves when the download completes successfully.
 * @throws {Error} Throws an error if the download fails.
 */
async function downloadZip(url, destPath) {
    return new Promise((resolve, reject) => {
        try {
            const file = Gio.File.new_for_path(destPath);
            const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

            const request = Gio.File.new_for_uri(url).read(null);

            let chunk;
            while ((chunk = request.read_bytes(4096, null))) {
                if (chunk.get_size() === 0) break;
                stream.write_bytes(chunk, null);
            }

            stream.close(null);
            request.close(null);

            resolve();
        } catch (error) {
            reject(new Error(`Failed to download file: ${error.message}`));
        }
    });
}

// A single function that returns all relevant information for a theme
function getVariant(variant = 'Adwaita-blue') {
    const possiblePaths = [
        '/var/usrlocal/share/icons',
        '/usr/share/icons',
        GLib.get_home_dir() + '/.local/share/icons'
    ];

    for (const path of possiblePaths) {
        const iconThemePath = GLib.build_filenamev([path, variant]);
        if (GLib.file_test(iconThemePath, GLib.FileTest.EXISTS)) {
            return {
                found: true,
                path: iconThemePath,
                state: getInstallState(path)  // Either 'root' or 'user'
            };
        }
    }

    // If not found, return a default value indicating it doesn't exist
    return { found: false, path: null, state: null };
}

// Function to get the install state (root or user)
function getInstallState(path) {
    if (path.startsWith('/var') || path.startsWith('/usr')) {
        return 'root';
    }
    return 'user';
}

export { fetchLatestVersion, downloadZip, getVariant};
