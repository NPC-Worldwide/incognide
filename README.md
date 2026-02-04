<p align="center">
  <img src="https://raw.githubusercontent.com/npc-worldwide/incognide/main/levi.PNG" alt="Incognide logo with Levi the dog howling at the moon" width="400" height="400">
</p>

<h1 align="center">Incognide</h1>

<p align="center">
  <strong>Explore the unknown and build the future.</strong>
</p>

<p align="center">
  <a href="https://github.com/npc-worldwide/incognide/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3%20%2B%20restrictions-blue.svg" alt="License"></a>
  <a href="https://enpisi.com/incognide"><img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg" alt="Platforms"></a>
  <a href="https://github.com/npc-worldwide/incognide/releases"><img src="https://img.shields.io/github/v/release/npc-worldwide/incognide?include_prereleases" alt="Release"></a>
</p>

<p align="center">
  <a href="https://enpisi.com/incognide"><strong>Download for Linux, macOS, and Windows</strong></a>
</p>

---

Incognide unifies chat, code, documents, web browsing, and media into a tileable workspace with intelligent context and composable automations.

Built for seamless workflows, Incognide eliminates distractions and context switching. A path-based organization keeps your work structured naturally, while auto-saving workspaces let you resume any project exactly where you left off. No more juggling desktops, drowning in browser tabs, or hunting for scattered files.


### Highlights

- Write and run code, use terminals, build reusable workflows and tools that chain together natural language and templateable code through jinja execution templates.
- Browse the web, read and annotate PDFs, analyze data and create dashboards, compile LaTeX.
- Edit DOCX, XLSX, PPTX, MAPX.
- Arrange chats, editors, PDFs, browsers, terminals as your work evolves.
- Manage agents, have them run on jobs, edit team context, integrate with MCP Servers, approve or rejected suggested memories, prune and evolve knowledge graphs.
- Fine-tune your own image and text models using curated data from your conversations and memories.

## Demo Video 
Updated version coming soon....

---

## Quick Start

1. **Download** the installer for your platform from [enpisi.com/incognide](https://enpisi.com/incognide)
2. **Run** the installer and launch Incognide
3. **Configure** your models:
   - **Local models**: Install [Ollama](https://ollama.ai), [LM Studio](https://lmstudio.ai), or run a [llama.cpp server](https://github.com/ggerganov/llama.cpp)
   - **Cloud providers**: Add API keys in Settings for OpenAI, Anthropic, Gemini, etc.
4. **Start working** - select a model and begin a conversation or open files

---

## Table of Contents

- [Office & Productivity](#office--productivity)
- [Development](#development)
- [Research & Knowledge Management](#research--knowledge-management)
- [Model Training & Fine-tuning](#model-training--fine-tuning)
- [AI Chat & Agents](#ai-chat--agents)
- [Image Tools (Vixynt)](#image-tools-vixynt)
- [Settings & Customization](#settings--customization)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Installation](#installation)
- [Development Setup](#development-setup)
- [Community](#community)
- [License](#license)

---

## Office & Productivity

### Document Editing

Create and edit Office documents directly in Incognide without needing external applications or cloud services.

**Word Documents (DOCX)** - Full rich text editing with formatting, tables, and images:

![DOCX and XLSX Editing](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/docx_xlsx.png)

**Spreadsheets (XLSX & CSV)** - Edit data with formula support and cell formatting:

![CSV Editing](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/csv.png)

**Presentations (PPTX)** - View and edit PowerPoint presentations:

![PPTX Editing](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/pptx.png)

### PDF Management

Read, annotate, and analyze PDF documents with AI assistance.

**Highlight & Annotate** - Mark up PDFs with highlights that persist across sessions:

![PDF Highlighting](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/pdf_highlight.png)

**PDF Library** - Browse and organize your PDF collection:

![PDF Library](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/library.png)

### File Management

**Folder Explorer** - Drag any folder from the sidebar into a pane to open a dedicated file browser:

![Folder contents](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/folder_explorer.png)

**Disk Usage Analyzer** - Visualize what's taking up space on your drives:

![Disk usage](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/disk_usage_analyzer.png)

### Web Browsing

Browse the web alongside your documents and chat with AI about what you're viewing.

**Integrated Browser** - No need to switch to a separate browser window:

![AI Web Browsing](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/browse_and_chat.png)

**Tileable configuration** - Browse while viewing PDF with a terminal open and a chat window:

![Tiled PDF Browser](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/tiled_pdf_browser.png)

---

## Development

### Code Editing

Write code with syntax highlighting, run scripts, and compile documents.

**Code Editor and script execution** - Syntax highlighting for Python, JavaScript, TypeScript, and more. Run Python scripts directly and see output inline:

![script execution](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/script_execution.png)

**LaTeX Compilation** - Write and compile LaTeX documents with PDF generation launching a pane.

![latex compilation](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/latex.png)

### AI-Assisted Development

**File Analysis** - Select files and ask AI to analyze, explain, or refactor code:

![Analyze Files](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/analyze_files.png)

### Database Tools

Connect to databases, explore schemas, and run queries.

**Schema Viewer and SQL Querying** - Investigate your database structure, write queries manually or with natural language.

![Database Schema](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/db_viewer.png)

Manipulate table results and plot data directly for quick analysis:

![Database Query](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/db_query.png)

### Git Integration

**Git Manager** - Stage, commit, and manage branches without leaving Incognide:

![git manager](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/git_manager.png)

---

## Research & Knowledge Management

### Data Analysis

Build dashboards and visualizations from your data.

**Data Dashboard** - Composable widgets for analytics and visualization:

![Data Dashboard](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/data_dash.png)

### Knowledge Graphs

Explore connections between concepts and entities.

**Graph Explorer** - Navigate and edit knowledge graphs built from your conversations:

![Knowledge Graph](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/kg_inspector.png)

### Memory & Context

**Memory Management** - Review, edit, and organize what your agents remember:

![Memory CRUD](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/memory_crud.png)

**Agent Memories** - See what context agents have learned from conversations:

![Agent memories](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/memories.png)

---

## Model Training & Fine-tuning

Train custom AI models using your own data—no coding required. Incognide provides first-class UI for curating training data from your conversations and memories, then fine-tuning models locally.

### Image Model Training

Fine-tune image generation models with your own images using LoRA training.

**Training Interface** - Select reference images, configure training parameters, and monitor progress:

<!-- ![Image Training](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/image_training.png) -->

*Features:*
- Drag-and-drop image selection for training datasets
- Automatic captioning with AI assistance
- LoRA training with configurable rank, learning rate, and epochs
- Real-time training progress and loss visualization
- Export trained adapters for use in generation

### Text Model Training

Fine-tune language models using curated subsets of your AI interactions and memories.

**Data Curation** - Select specific conversations, memories, and agent interactions to use as training data:

<!-- ![Text Training Data](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/text_training_data.png) -->

*Features:*
- Browse and filter your conversation history
- Select individual messages or entire conversations for training
- Export agent memories as training examples
- Preview and edit training pairs before export
- Quality scoring to identify high-value training examples

**Training Pipeline** - Fine-tune models locally with LoRA/QLoRA:

<!-- ![Text Training](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/text_training.png) -->

*Features:*
- Support for Llama, Mistral, Qwen, and other popular architectures
- LoRA and QLoRA for efficient training on consumer hardware
- Configurable hyperparameters with sensible defaults
- Training metrics and loss curves
- Merge adapters or use them standalone

### Why Fine-tune?

- **Personalization** - Train models that understand your terminology, preferences, and domain
- **Privacy** - Keep sensitive data local; train on private conversations without uploading anywhere
- **Specialization** - Create expert models for specific tasks from your best interactions
- **Cost savings** - Run fine-tuned smaller models instead of expensive API calls

---

## AI Chat & Agents

### Conversations

**Chat Interface** - Clean, focused conversations with AI:

![Chat Window](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/chat.png)

**Model Selection** - Choose from local models (Ollama, llama.cpp) or cloud providers (OpenAI, Anthropic, Gemini):

![Model Selector](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/model_selector.png)

**Aggregate Conversations** - Select multiple conversations and combine them for context:

![Select Conversations](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/convo_agg.png)

![Aggregate Messages](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/agg_messages.png)

**File Attachments** - Include files directly in your conversations:

![Include Attachments](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/include_attachments.png)

### Tool Use & MCP

**Agentic Tool Use** - Enable agents to use tools from MCP Servers or local Jinxs:

![MCP Tool Use](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/mcp_tool_use.png)

**MCP Server Management** - Connect to Model Context Protocol servers:

![Manage mcp servers](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/mcp_server.png)

### Browser Automation

Agents can control browser panes directly - clicking elements, typing into inputs, extracting page content, and taking screenshots.

**Agent Browser Control** - Agents can open browser panes and interact with web pages:

![Agent Browser Pane](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/incognide_agent_browser_pane.png)

**Click & Type** - Agents click elements by text or CSS selector and fill in forms:

![Agent Browsing and Clicking](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/incognide_browsing_clicking.png)

Available browser actions for agents:
- `browser_click` - Click elements by selector or text content
- `browser_type` - Type into input fields with optional form submission
- `get_browser_content` - Extract page text content for context
- `browser_screenshot` - Capture page screenshots
- `browser_eval` - Execute JavaScript in page context

### Terminal & File Control

Agents can also interact with terminal panes and files directly within Incognide.

**Terminal Commands** - Agents can run commands in terminal panes:

![Agent Terminal](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/agent_terminal.png)

**File Operations** - Agents can open, read, and edit files in editor panes:

![Agent File Pane](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/agent_file_pane.png)

### Agent Management

**NPC Editor** - Create and customize AI personas with specific directives, models, and capabilities:

![Edit NPCs](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/agent_editor.png)

**Agent History** - Track what your agents have done:

![Agent History](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/npc_history.png)

**Team Management** - Manage global and project-specific context for your agent team:

![Context Editor](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/team_management.png)

### Jinx Workflows

Jinxs are reusable automation templates that combine natural language prompts with code execution.

**Jinx Editor** - Create and edit Jinx workflows:

![Jinx Editor](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/jinx.png)

**Jinx Execution** - Run Jinxs with custom parameters:

![Jinx Execution](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/jinx_execution.png)

**SQL Jinx** - Create Jinxs that query databases:

![SQL Jinx](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/sql_jinx.png)

**Agents in SQL** - Utilize agents and NPC personas within your SQL models for advanced analyses with native graph computations afforded by SQL engines.

![Agents in SQL models](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/nql.png)

### Scheduled Tasks

**Cron Jobs** - Schedule Jinxs and agents to run automatically:

![Cron jobs](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/cron_daemon.png)

---

## Image Tools (Vixynt)

### Photo Browser

Browse and organize your image collection:

![Photo Editor](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/vixynt.png)

### AI Image Generation

Generate images using AI with reference images for style and composition:

![Vixynt Editing](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/vixynt_image_edit.png)

### DarkRoom

Simple photo editing with cropping, filters, and adjustments:

![DarkRoom](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/darkroom.png)

---

## Settings & Customization

The Settings panel provides comprehensive configuration across multiple tabs: Global Settings, Theme, Keyboard Shortcuts, Model Management, Voice/TTS, Custom Providers, Passwords, Python Environment, and Account.

![Global Settings](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/settings1.png)

### Cloud Sync & Account

**Sign In** - Create an account to sync your conversations, settings, and workspace state across devices.

**End-to-End Encryption** - All synced data is encrypted with your passphrase before leaving your device. Your passphrase never leaves your machine.

**Multi-Device** - Work on your desktop, pick up on your laptop. Your conversations, memories, and workspace layout stay in sync.

### macOS Permissions

On macOS, manage permissions for camera, microphone, and screen capture from Settings. Required for voice input and screenshot features.

### Theme

Light and dark modes with full color customization:

![Light Mode](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/light_mode.png)

### Sidebar

**Collapsible Sidebar** - Manage files, conversations, and navigation:

![Sidebar](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/sidebar.png)

### Model Management

Configure, download, and manage models from multiple sources:

![model management](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/model_management.png)

**HuggingFace Integration** - Download GGUF models directly:

![hf model management](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/hf.png)

**Custom Providers** - Connect to custom OpenAI-compatible APIs:

![custom api](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/custom_api.png)

### Voice & Audio

Configure TTS and STT settings:

![TTS](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/tts_management.png)

### Python Environment

Configure Python environments per project:

![Environment Variables](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/env_vars.png)

### Keyboard Shortcuts

View and customize keyboard shortcuts:

![keyboard shortcuts](https://raw.githubusercontent.com/npc-worldwide/incognide/main/gh_images/keyboard_shortcuts.png)


---

## Installation

Pre-built executables are available for **Linux**, **macOS**, and **Windows** at [enpisi.com/incognide](https://enpisi.com/incognide).


---

## Development Setup

Incognide is an Electron + React frontend with a Python Flask backend powered by [npcpy](https://github.com/npc-worldwide/npcpy). The UI uses [npcts](https://github.com/npc-worldwide/npcts), a React component library.

### Prerequisites

- [npcpy](https://github.com/npc-worldwide/npcpy) - Core Python library
- [npcsh](https://github.com/npc-worldwide/npcsh) - Shell interface (starts the backend)
- [npcts](https://github.com/npc-worldwide/npcts) - React component library (installed via npm)
- Node.js 16+ and npm
- Ollama (optional, for local models)

### Setup

**Option 1: Manual setup**
```bash
git clone https://github.com/npc-worldwide/incognide.git
cd incognide
npm install
```

**Option 2: Via npcsh** (installs to `~/.npcsh/incognide`)
```bash
npcsh> /incognide
```

### Running

```bash
python incognide_serve.py   # Backend
npm run dev                   # Frontend (Vite)
npm start                     # Electron
```

---

## Community

- **Discord**: [Join us](https://discord.gg/FwnSygWc)
- **Issues & Bugs**: [GitHub Issues](https://github.com/npc-worldwide/incognide/issues)
- **Discussions**: [GitHub Discussions](https://github.com/npc-worldwide/incognide/discussions)
- **NPC Ecosystem**: [npcpy](https://github.com/npc-worldwide/npcpy) | [npcsh](https://github.com/npc-worldwide/npcsh) | [npcts](https://github.com/npc-worldwide/npcts)

---

## License

Incognide is licensed under AGPLv3 with additional terms prohibiting third-party SaaS services and packaged resale. See the [LICENSE](LICENSE) file for details.
