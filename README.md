# NormaHub MCP Server (Model Context Protocol)

[![npm version](https://img.shields.io/badge/npm-v0.2.0-red.svg)](https://npmjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![NormaHub Gateway](https://img.shields.io/badge/API-NormaHub%20Direct-7B48E8.svg)](https://normahub.cc/?utm_source=github&utm_medium=oss&utm_campaign=mcp-server-normahub&utm_content=badge)
[![Direct Access](https://img.shields.io/badge/VPN-Not%20Required%20(РФ)-success.svg)](https://normahub.cc)
[![MCP Standard](https://img.shields.io/badge/MCP-Tools%20%7C%20Resources%20%7C%20Prompts-blueviolet.svg)](https://modelcontextprotocol.io)
[![Catalog](https://img.shields.io/badge/Models-30%20Active%20LLMs-blue.svg)](https://normahub.cc/models)

Официальный production-сервер **Model Context Protocol (MCP)** для экосистемы [NormaHub](https://normahub.cc/?utm_source=github&utm_medium=oss&utm_campaign=mcp-server-normahub&utm_content=hero_link). Подключает 30 передовых AI-моделей к **Claude Desktop, Cursor, Antigravity, Windsurf и автономным AI-агентам** без VPN и с оплатой в рублях.

Сервер реализует **все 3 фундаментальных столпа спецификации MCP**:
1. 🛠️ **Tools (Инструменты):** вызов LLM (диалоги и история сообщений), Image-to-Video и Text-to-Video генерация (SeeDance 2.5 / Grok), генерация изображений.
2. 📦 **Resources (Ресурсы):** прямое чтение каталога моделей, тарифов и статуса шлюза в контекст агента через URI `normahub://`.
3. 💬 **Prompts (Промпты):** готовые системные шаблоны (Senior Code Review под Claude Sonnet 5.5, режиссура сцен для SeeDance, FinOps оптимизация расходов).

Сервер поддерживает **двойной транспорт**: локальный **Stdio** и сетевой **SSE (Server-Sent Events)** для Docker и удаленных серверов.

---

## 🏛️ Три столпа Model Context Protocol в NormaHub

```
                        ┌────────────────────────────────────────┐
                        │          NormaHub MCP Server           │
                        └───────────────────┬────────────────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         ▼                                  ▼                                  ▼
  🛠️ TOOLS (Действия)              📦 RESOURCES (Данные)             💬 PROMPTS (Шаблоны)
  • normahub_prompt_model            • normahub://models               • review_code
  • normahub_image_to_video          • normahub://status               • direct_video_scene
  • normahub_generate_video                                            • cost_optimize_route
  • normahub_generate_image
  • normahub_list_models
```

---

### 1. 🛠️ Tools (Инструменты)

Инструменты дают вашему AI-ассистенту возможность автономно выполнять действия во внешнем мире:

| Инструмент | Описание | Основные параметры |
|---|---|---|
| **`normahub_prompt_model`** | Вызов любой из 30 моделей без VPN с поддержкой полной истории сообщений | `model`, `prompt`, `messages: [{role, content}]`, `system`, `temperature` |
| **`normahub_image_to_video`** | **[NEW]** Анимация статичного изображения в 1080p видео через SeeDance 2.5 / 2.0 | `image_url` (URL/data URI), `prompt` (движение), `model` |
| **`normahub_generate_video`** | Генерация кинематографичного видео из текста (SeeDance 2.5, Grok Imagine Video) | `prompt`, `model` (`seedance-2.5`, `grok-imagine-video-1.5`) |
| **`normahub_generate_image`** | Высокодетализированная генерация картинок (GPT Image 2.5 Flare, Grok Image 2.0) | `prompt`, `model` |
| **`normahub_list_models`** | Мгновенный запрос списка активных моделей и цен шлюза | — |

---

### 2. 📦 Resources (Ресурсы)

Ресурсы предоставляют AI-клиенту актуальные структурированные данные без расхода лишних токенов на поиск. Они доступны по стандартным MCP URI:

* **`normahub://models`** — возвращает полный каталог 30 подключенных моделей, их контекстные окна (до 1M токенов), capabilities (Vision, Reasoning, Tools, Stream) и официальные цены на входные/выходные токены в JSON и Markdown.
* **`normahub://status`** — возвращает живой пинг шлюза (latency в ms), статус доступности, список всех эндпоинтов и подтверждение прямого маршрута из РФ без VPN.

#### Как использовать Resources в Cursor и Claude Desktop:
- **В Cursor:** при наборе сообщения введите `@` и выберите подключенный ресурс `normahub://models` или `normahub://status` для автоматического прикрепления его содержимого в контекст.
- **В Claude Desktop:** ресурсы отображаются в боковой панели контекста и могут быть прикреплены ассистентом автоматически при вопросах о доступных моделях и ценах.

---

### 3. 💬 Prompts (Шаблоны промптов)

Сервер экспортирует готовые параметризованные шаблоны для решения типовых инженерных задач:

1. **`review_code`** (оптимизирован для `claude-sonnet-5-5`):
   - Глубокий Senior/Principal аудит архитектуры, поиск утечек памяти, race conditions, уязвимостей безопасности и конкретные предложения рефакторинга.
   - Параметры: `code` (исходный код/diff), `context` (стек и окружение), `focus` (архитектура, безопасность, производительность).
2. **`direct_video_scene`** (оптимизирован для `seedance-2.5`):
   - Режиссерский генератор сцен: расчет движения камеры (dolly, crane, tracking shot), оптики, освещения, физики и тайминга для нейросети SeeDance 2.5.
   - Параметры: `concept` (сюжет сцены), `style` (стилистика/оптика), `aspect_ratio` (16:9, 9:16).
3. **`cost_optimize_route`** (FinOps маршрутизация):
   - Анализ задачи и подбор самой дешевой подходящей модели из каталога (например, маршрутизация рутины на DeepSeek v4.1-flash по цене $0.018/1M токенов с эскалацией сложных кейсов на Claude Sonnet 5.5).
   - Параметры: `task_description`, `expected_volume`, `latency_sensitivity`.

#### Как использовать Prompts в Claude Desktop и Cursor:
- **В Claude Desktop:** нажмите иконку промптов (или символ `/`) в поле ввода чата, выберите шаблон (например, `review_code`) и заполните аргументы в появившейся форме.
- **В Cursor:** используйте панель вызова промптов в MCP интеграциях.

---

## ⚡ Быстрое подключение (Quickstart)

### 1. Claude Desktop (Stdio транспорт)

Откройте конфигурационный файл Claude Desktop:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Добавьте конфигурацию:

```json
{
  "mcpServers": {
    "normahub": {
      "command": "npx",
      "args": ["-y", "@normahub/mcp-server"],
      "env": {
        "NORMAHUB_API_KEY": "nr_hub_ваш_ключ_здесь"
      }
    }
  }
}
```

---

### 2. Cursor IDE

В настройках Cursor (`Cursor Settings -> Features -> MCP`):

#### Вариант А: Stdio (Локальный запуск)
1. Нажмите **+ Add New MCP Server**.
2. **Name:** `normahub`
3. **Type:** `command`
4. **Command:**
   ```bash
   npx -y @normahub/mcp-server
   ```
5. В Environment Variables:
   `NORMAHUB_API_KEY=nr_hub_ваш_ключ`

#### Вариант Б: SSE (Сетевое подключение к удаленному серверу)
1. **Name:** `normahub-sse`
2. **Type:** `sse`
3. **URL:** `http://ваш-сервер:3001/sse`

---

## 🌐 Сетевой запуск через SSE (Server-Sent Events) и Docker

Для использования на удаленных серверах, в Kubernetes или внутри команды доступен режим **SSE Transport**.

### Локальный запуск SSE:

```bash
git clone https://github.com/normahubcc/mcp-server-normahub.git
cd mcp-server-normahub
npm install
npm run build

export NORMAHUB_API_KEY="nr_hub_ваш_ключ"
npm run start:sse
```

Сервер запустится на порту `3001` (или `$PORT`):
- **SSE Stream:** `http://localhost:3001/sse`
- **Message POST Endpoint:** `http://localhost:3001/messages`
- **Health check:** `http://localhost:3001/health`

### Запуск в Docker:

Сборка и запуск контейнера:

```bash
docker build -t normahub-mcp-server .
docker run -d \
  -p 3001:3001 \
  -e NORMAHUB_API_KEY="nr_hub_ваш_ключ" \
  --name normahub-mcp \
  normahub-mcp-server
```

Проверка здоровья:

```bash
curl http://localhost:3001/health
```

---

## 🔍 Отладка через MCP Inspector

Сервер включает официальный графический инспектор протокола:

```bash
npm run inspect
```

В браузере откроется интерактивный интерфейс, в котором можно в реальном времени проверять вызовы Tools, чтение Resources (`normahub://models`, `normahub://status`) и генерацию Prompts.

---

## 💡 Примеры сценариев использования

### Оживление картинки в видео (Image-to-Video)
> *«Возьми изображение https://example.com/character.png и оживи его через SeeDance 2.5: пусть персонаж плавно поворачивает голову и улыбается на фоне неонового заката»*  
> ➔ Агент вызывает `normahub_image_to_video` и возвращает готовую ссылку на скачивание MP4.

### Архитектурное код-ревью через Claude Sonnet 5.5
> *«Вызови шаблон review_code для функции handlePayment() с фокусом на race conditions»*  
> ➔ Агент активирует промпт `review_code` и передает задачу флагманской модели `claude-sonnet-5-5` через NormaHub без VPN.

### FinOps аудит и снижение затрат
> *«Посмотри ресурс normahub://models и подскажи, какую модель выгоднее всего использовать для классификации 500 000 поисковых запросов в сутки»*  
> ➔ Агент считывает ресурс и рекомендует `deepseek-v4.1-flash` ($0.018 за 1M входных токенов), рассчитывая точную экономию.

---

## 📊 Сравнение с официальным доступом

| Параметр | Официальные провайдеры напрямую | Через NormaHub MCP |
|---|---|---|
| **Способ оплаты** | Иностранные карты, зарубежные юрлица (+30% НДС) | **Карты РФ, СБП, рубли, закрывающие документы** |
| **Доступность** | Требуется постоянный VPN, блокировки IP | **Прямой маршрут из РФ без VPN** |
| **Стандарт MCP** | Разрозненные серверы под каждый сервис | **Единый S-Tier сервер: 30 моделей, I2V/T2V видео, Resources и Prompts** |
| **Транспорт** | Чаще только Stdio | **Stdio + SSE для Docker и командных стендов** |
| **Лимиты** | Непредсказуемый постоплатный биллинг | Жесткие настраиваемые лимиты по ключам |

---

## 🎁 Приветственный бонус

Используйте промокод **`GH-MCP`** при регистрации на [normahub.cc](https://normahub.cc/?utm_source=github&utm_medium=oss&utm_campaign=mcp-server-normahub&utm_content=promo) — он начислит **150 ₽** на ваш баланс для тестирования инструментов, генерации видео и вызова моделей.

---

## 📚 Документация и сообщество
- Каталог всех 30 моделей и тарифы: [normahub.cc/models](https://normahub.cc/models)
- Разбор архитектуры MCP: [«MCP: что это и как агент получает доступ к инструментам»](https://normahub.cc/company/articles/mcp-chto-eto-dostup-k-instrumentam)
- Безопасность MCP: [«MCP Security: главные риски»](https://normahub.cc/company/articles/mcp-security-glavnye-riski)
- Telegram-сообщество: [@nhubcc](https://t.me/nhubcc)

---

## Лицензия
Распространяется под свободной лицензией [MIT](LICENSE).
