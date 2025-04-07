# Ollama Assistant Chrome Extension

A Chrome extension that provides a side panel interface to interact with Ollama AI services.

## Features

- Side panel interface accessible via toolbar button or keyboard shortcut
- AI chat functionality using Ollama API
- Simple and clean Apple-inspired design
- Chat history persistence

## Requirements

- Chrome browser (version 114 or later)
- Ollama running locally on port 11434

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension should now appear in your toolbar

## Usage

1. Click the extension icon in the toolbar or use the keyboard shortcut (Ctrl+Shift+O or Command+Shift+O on Mac)
2. The side panel will open with the AI Chat interface
3. Type your message and press Enter or click the send button
4. The AI will respond using the Ollama service

## Development

The extension is structured as follows:

- `locale/` - Contains the translation files
- `chrome/` - Contains the manifest and background script
- `assets/` - Contains extension icons
- `src/` - Contains the extension UI
  - `index.html` - Main HTML file
  - `css/` - CSS files
  - `js/` - JavaScript files and modules

## License

MIT 