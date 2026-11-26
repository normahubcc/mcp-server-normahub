<p align="center">
  <a href="https://normahub.cc">
    <img src="./docs/images/logo.png" alt="NormaHub" width="120" />
  </a>
</p>

# NormaHub MCP Server

[![npm version](https://img.shields.io/npm/v/@normahub/mcp-server?style=flat-square&color=CB3837&logo=npm)](https://www.npmjs.com/package/@normahub/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@normahub/mcp-server?style=flat-square&color=blue)](https://www.npmjs.com/package/@normahub/mcp-server)
[![Node](https://img.shields.io/badge/node-22%2B-green?style=flat-square)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.normahubcc-blueviolet?style=flat-square)](https://registry.modelcontextprotocol.io)

MCP-сервер для API [NormaHub](https://normahub.cc): текстовые модели, генерация изображений, видео и расшифровка аудио — из Claude Desktop, Cursor, Zed, Continue и любого другого MCP-клиента.

Ключевое отличие от «обёртки над OpenAI»: **каталог моделей и цены берутся из живого API**, а не из захардкоженного списка. Модель, которой больше нет в каталоге, не будет молча вызвана по устаревшему id — сервер скажет об этом и предложит существующие.

## Что внутри

**8 инструментов**

| Инструмент | Назначение | Ключевые аргументы |
|---|---|---|
| `normahub_list_models` | Живой каталог: id, вендор, модальность, контекст, цены | `category`, `query`, `limit` |
| `normahub_estimate_cost` | Оценка стоимости до вызова: токены/кэш, изображения, секунды видео | `model`, `input_tokens`, `output_tokens`, `image_count`, `video_seconds`, `resolution` |
| `normahub_prompt_model` | Запрос к LLM, возвращает ответ, usage и оценку стоимости | `model`, `prompt`, `messages`, `system`, `temperature`, `max_tokens` |
| `normahub_generate_image` | Генерация изображения, возвращает URL или inline-данные | `prompt`, `model`, `size`, `n` |
| `normahub_generate_video` | Text-to-video с опросом задачи и progress-уведомлениями | `prompt`, `model`, `duration`, `aspect_ratio`, `resolution` |
| `normahub_image_to_video` | Image-to-video | `image_url`, `prompt`, `model`, `duration` |
| `normahub_transcribe_audio` | Whisper: локальный файл или URL, до 25 МБ | `file_path`, `url`, `language`, `prompt` |
| `normahub_get_balance` | Баланс и тариф; ошибка авторизации возвращается как ошибка | — |

**2 ресурса:** `normahub://models` (каталог с markdown-таблицей), `normahub://status` (доступность шлюза, задержка вызова моделей).

**3 шаблона промптов:** `review_code`, `direct_video_scene`, `cost_optimize_route`.

## Транспорты

| Транспорт | Адрес | Когда использовать |
|---|---|---|
| **stdio** | процесс по stdin/stdout | локальные клиенты: Claude Desktop, Cursor, Zed, Continue |
| **Streamable HTTP** | `POST /mcp` | удалённый сервер, несколько пользователей. Это транспорт, который рекомендует спецификация MCP |
| **HTTP + SSE** (устаревший) | `GET /sse`, `POST /messages` | только для клиентов, которые ещё не умеют Streamable HTTP |
| **Health** | `GET /health` | пробы в Docker/Kubernetes: версия, число инструментов, активные SSE-сессии |

## Установка

Требуется Node.js 22 или новее.

```bash
npx -y @normahub/mcp-server
```

Ключ выдаётся в [личном кабинете](https://normahub.cc/dashboard). Каталог и оценка стоимости работают и без ключа; платные вызовы без него вернут понятную ошибку.

### Claude Desktop (stdio)

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS),
`~/.config/Claude/claude_desktop_config.json` (Linux),
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "normahub": {
      "command": "npx",
      "args": ["-y", "@normahub/mcp-server"],
      "env": { "NORMAHUB_API_KEY": "nr_hub_..." }
    }
  }
}
```

### Cursor

`Settings → Tools & MCP → New MCP Server`, затем в `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "normahub": {
      "command": "npx",
      "args": ["-y", "@normahub/mcp-server"],
      "env": { "NORMAHUB_API_KEY": "nr_hub_..." }
    }
  }
}
```

Готовые конфиги для Zed и Continue — в [`examples/`](examples/).

### Удалённый сервер (Streamable HTTP)

```bash
git clone https://github.com/normahubcc/mcp-server-normahub.git
cd mcp-server-normahub
docker build -t normahub-mcp .
docker run -d --name normahub-mcp \
  -p 3001:3001 \
  -e NORMAHUB_API_KEY=nr_hub_... \
  normahub-mcp
```

Клиент подключается к `http://host:3001/mcp`. Ключ читается из окружения сервера и никогда не передаётся в запросах клиента — это позволяет держать один ключ на команду.

Локально без Docker:

```bash
npm run build
NORMAHUB_API_KEY=nr_hub_... npm run start:http
```

## Переменные окружения

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `NORMAHUB_API_KEY` | — | ключ API; нужен для платных инструментов |
| `NORMAHUB_BASE_URL` | `https://api.normahub.cc/v1` | другой шлюз или прокси |
| `NORMAHUB_DEFAULT_MODEL` | `claude-sonnet-5-5` | модель для `normahub_prompt_model` без аргумента `model` |
| `NORMAHUB_DEFAULT_VIDEO_MODEL` | первая видео-модель каталога | модель для видео без аргумента `model` |
| `NORMAHUB_TIMEOUT_MS` | `120000` | таймаут текстового запроса |
| `NORMAHUB_OFFLINE` | `0` | `1` — не ходить в сеть за каталогом, использовать встроенный снимок |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | только для HTTP-транспорта |

## Каталог и цены

Каталог запрашивается у `https://api.normahub.cc/api/v1/public/models` и живёт в памяти 10 минут. Порядок источников: живой ответ → последний успешный ответ → встроенный снимок из пакета. В ответах инструментов видно, какой источник использован (`source: live` / `source: bundled`) и когда каталог обновлялся на стороне API.

Цены в каталоге — **USD-лист**, как их отдаёт API. Списание происходит в рублях по курсу шлюза, поэтому `normahub_estimate_cost` показывает оценку и напоминает проверить счёт.

## Разработка

```bash
npm ci
npm test          # tsc + 30 тестов: каталог, инструменты, протокол, stdio, HTTP/SSE
npm run build
npm pack --dry-run
```

Тесты транспортов поднимают настоящий процесс `dist/index.js` через stdio и реальный HTTP-сервер на свободном порту, а не только проверяют фабрику сервера. Сеть в тестах не используется: ответ API подменяется фикстурой.

Обновление пакета:

1. поднять `version` в `package.json`, `server.json` и в `packages[0].version` (тест сверит их между собой);
2. `npm test`, `npm pack --dry-run`;
3. `npm publish`, затем `mcp-publisher publish` для реестра MCP.

## Ограничения, о которых стоит знать

- `updated_at` в публичном каталоге может отставать от фактических изменений — сервер показывает его как есть, а не выдаёт за свежесть.
- Видео тарифицируется посекундно, но в карточке модели цена иногда отображается нулевой; оценка строится по полю `video_price_*_per_sec` и предупреждает, если его нет.
- Whisper принимает файлы до 25 МБ — ограничение проверяется до загрузки, а не после отказа провайдера.
- SSE-сессии ограничены 64 одновременными подключениями (`maxSessions`), чтобы брошенные соединения не съедали память.

## Лицензия

MIT. См. [LICENSE](LICENSE).