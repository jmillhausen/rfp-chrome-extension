# SnapLogic RFX Agent Chrome Extension

AI-powered Chrome extension that automatically extracts and answers RFP, RFI, and RFQ questions using SnapLogic's intelligent pipelines.

## Features

- **Automatic Question Extraction**: Scan any RFP/RFI/RFQ webpage and instantly extract all questions
- **AI-Powered Answers**: Generate professional, contextual responses using SnapLogic's knowledge base
- **Individual Question Answering**: Click "Answer Question" button for each question
- **Custom Queries**: Ask any question about SnapLogic products and capabilities in the Custom Query tab
- **Persistent Storage**: Your work is automatically saved as you go

---

## Installation

### Load Unpacked Installation

1. **Download the Extension Files**
   - Download all 7 files:
     - `manifest.json`
     - `popup.html`
     - `popup.js`
     - `background.js`
     - `icon16.png`
     - `icon48.png`
     - `icon128.png`
   - Place them all in a single folder (e.g., `SnapLogic-RFX-Agent`)

2. **Install in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right corner)
   - Click **Load unpacked**
   - Select the folder containing all the extension files
   - The SnapLogic icon should appear in your Chrome toolbar

3. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in Chrome toolbar
   - Find "SnapLogic RFX Agent"
   - Click the pin icon to keep it visible

---

## Usage

### Extracting Questions from an RFP

1. **Navigate to an RFP Document**
   - Open any webpage containing RFP, RFI, or RFQ questions
   - Examples: Google Docs, Confluence pages, vendor portals

2. **Open the Extension**
   - Click the SnapLogic RFX Agent icon in your toolbar
   - The side panel will open on the right side of your browser

3. **Extract Questions**
   - Click **"Extract Questions from Webpage"**
   - Wait while the AI analyzes the page content (usually 5-10 seconds)
   - All questions will be displayed with their section and priority level

### Answering Questions

1. Click the **"Answer Question"** button below any question
2. The AI will query the SnapLogic knowledge base and generate a response
3. The formatted answer appears automatically
4. Repeat for each question you want answered

### Custom Queries

1. Click the **"Custom Query"** tab at the top
2. Type any question about SnapLogic (e.g., "What is a Groundplex?", "Explain SnapLogic's security features")
3. Click **"Send Custom Query"**
4. Receive a formatted answer from the knowledge base

### Resetting

- Click **"Reset"** to clear all questions and start over with a new RFP
- Your data is automatically saved, so you can close the browser and resume later

---

## SnapLogic Pipeline Configuration

The extension connects to two SnapLogic pipelines:

### AI Pipeline (Question Extraction & Answer Formatting)
- **URL**: `https://emea.snaplogic.com/api/1/rest/slsched/feed/ConnectFasterInc/snapLogic4snapLogic/AutoRFPAgent/chrome_extension_api`
- **Bearer Token**: `KqRkbzVyQAVjV5zaOzBd4tBsHG6AoGBX`
- **Purpose**: 
  - Extracts questions from webpage content
  - Formats answers from knowledge base into professional RFP responses

### Knowledge Base Pipeline
- **URL**: `https://emea.snaplogic.com/api/1/rest/slsched/feed/ConnectFasterInc/snapLogic4snapLogic/AutoRFPAgent/ApiRfpAgent`
- **Bearer Token**: `nNpLBJrd8FAtFh3TVC9xR97QAwWtJHgF`
- **Purpose**: Contains SnapLogic product information and documentation

### Pipeline Requirements

**For Question Extraction**, the AI pipeline must return:
```json
{
  "content": [
    {
      "question": "Question text here",
      "section": "Section name",
      "priority": "high"
    }
  ]
}
```
Or wrapped in array: `[{"content": [...]}]`

**For Answer Generation**, the AI pipeline must return:
```json
{
  "response": "Formatted answer text here"
}
```
Or wrapped in array: `[{"response": "..."}]`

---

## How It Works

### Architecture

1. **Question Extraction**: 
   - Chrome extension scrapes webpage content
   - Sends to SnapLogic AI pipeline (`chrome_extension_api`)
   - AI identifies questions, categorizes by section, and assigns priority

2. **Answer Generation**:
   - Extension sends question to SnapLogic AI pipeline (`chrome_extension_api`)
   - AI pipeline internally queries knowledge base (`ApiRfpAgent`)
   - AI formats response into professional RFP answer
   - Returns formatted answer to extension

3. **Data Flow**:
   ```
   Webpage → Extension → SnapLogic AI Pipeline → SnapLogic KB Pipeline
                                                         ↓
   Extension ← Formatted Answer ← SnapLogic AI Pipeline
   ```

---

## System Requirements

- **Browser**: Google Chrome version 88 or higher
- **Network**: Access to `emea.snaplogic.com` domain
- **Permissions**: Extension requires access to active tab and all URLs

---

## File Structure

```
SnapLogic-RFX-Agent/
├── manifest.json          # Extension configuration
├── popup.html            # Side panel UI
├── popup.js              # Main extension logic
├── background.js         # Background service worker
├── icon16.png           # 16x16 toolbar icon
├── icon48.png           # 48x48 management icon
└── icon128.png          # 128x128 web store icon
```

---

## Support

For issues or questions, contact Jordan Millhausen at jmillhausen@snaplogic.com

---

## Version

**Version**: 2.0
**Last Updated**: November 2025