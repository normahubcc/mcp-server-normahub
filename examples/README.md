# Готовые конфигурации подключения NormaHub MCP Server

Здесь собраны шаблоны конфигурации для быстрого подключения NormaHub MCP Server к популярным средам разработки и AI-ассистентам.

## 1. Claude Desktop
Файл: [`claude_desktop_config.json`](claude_desktop_config.json)

Расположение файла на вашей системе:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

## 2. Cursor IDE
Файл: [`cursor_settings.json`](cursor_settings.json)

Создайте в корне вашего рабочего проекта файл `.cursor/mcp.json` и вставьте содержимое, заменив `YOUR_NORMAHUB_API_KEY` на ваш реальный ключ.

## 3. Zed Editor
Файл: [`zed_settings.json`](zed_settings.json)

Добавьте секцию `context_servers` в настройки Zed (`~/.config/zed/settings.json`).

## 4. Continue.dev (VS Code / JetBrains)
Файл: [`continue_config.json`](continue_config.json)

Добавьте секцию в `~/.continue/config.json`.
