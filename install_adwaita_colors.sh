#!/bin/sh

# This script should download and install the latest Adwaita-colors release, if given the correct uri
# It also tries to run MoreWaita.sh script within the Adwaita-colors that automatically inherits MoreWaita if it is installed
# This script is not supposed to be changed, as all the information is given by parameters
# Any issue can be reported.

# Run: sh install_adwaita_colors.sh $REPO_URL $TEMP_ZIP_FILE $ICONS_DIR

REPO_URL=$1
TEMP_ZIP_FILE=$2
ICONS_DIR=$3
TEMP_DIR=$(mktemp -d)

if [ -z "$REPO_URL" ] || [ -z "$TEMP_ZIP_FILE" ] || [ -z "$ICONS_DIR" ]; then
    echo "Usage: $0 <repo-url> <temp-zip-file> <icons-dir>"
    exit 1
fi

# Download the ZIP file
curl -L "$REPO_URL" -o "$TEMP_ZIP_FILE" || { echo "Error downloading ZIP file."; exit 1; }

# Extract the ZIP file
unzip "$TEMP_ZIP_FILE" -d "$TEMP_DIR" || { echo "Error extracting ZIP file."; exit 1; }

# Ensure the icons directory exists
mkdir -p "$ICONS_DIR" || { echo "Error creating icons directory."; exit 1; }

# Move extracted contents
mv "$TEMP_DIR"/*/* "$ICONS_DIR"/ || { echo "Error moving files."; exit 1; }

# Run the MoreWaita.sh script
if [ -f "$ICONS_DIR/MoreWaita.sh" ]; then
    echo "Running MoreWaita.sh..."
    sh "$ICONS_DIR/MoreWaita.sh" || echo "MoreWaita.sh script failed, but continuing anyway."
else
    echo "MoreWaita.sh not found, skipping."
fi

# Clean up
rm -f "$TEMP_ZIP_FILE"
rm -rf "$TEMP_DIR"

echo "Adwaita-Colors installation complete."
exit 0

